import { SlashCommandBuilder, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import UsuarioInfo, { type IDeviceAuth } from '#models/UsuarioInfo.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { refreshMainAccountToken, refreshDeviceAuthJson, verifyToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { searchPlayersAutocomplete } from '#helpers/epic/social/searchPlayers.ts';
import { translateForUser, buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { createErrorEmbed, createInfoEmbed } from '#helpers/core/embedHelper.ts';
import type { LookupRunResult } from '#helpers/commands/epic/lookup/types.ts';

export default {
  data: new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Search for information about a Fortnite account')
    .setNameLocalizations(buildDiscordLocalizations('lookup.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('lookup.cmd._1'))
    .addStringOption((option) =>
      option
        .setName('displayname')
        .setDescription('The display name to search (optional, defaults to your account)')
        .setNameLocalizations(buildDiscordLocalizations('lookup.cmd.options.displayname.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('lookup.cmd.options.displayname._1'))
        .setRequired(false)
        .setAutocomplete(true)
    )
    .setDMPermission(true),

  async autocomplete(interaction: AutocompleteInteraction) {
    try {
      await searchPlayersAutocomplete(interaction, 'displayname', 25);
    } catch (error) {
      log.epic.error({ error }, 'Lookup autocomplete error');
      await interaction.respond([]);
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    let inputValue = interaction.options.getString('displayname');
    let displayName = inputValue;

    // Validar valores especiales del autocompletado
    const errorCodes = [
      'no_account',
      'invalid_token',
      'no_results',
      'token_expired',
      'rate_limited',
      'search_error',
      'bot_auth_error',
      'bot_token_expired',
      'no_search_permissions',
    ];

    if (inputValue && errorCodes.includes(inputValue)) {
      const errorMessage = await translateForUser(userId, `lookup.errors.${inputValue}`);
      const embed = await generarEmbedError('custom', {
        descripcion: errorMessage,
        client: interaction.client,
      });
      return await interaction.editReply({ embeds: [embed] });
    }

    // Determinar qué accessToken usar
    let mainAccount: IDeviceAuth | null = null;
    let useDbAccount = false;

    // 1. Intentar usar cuenta del usuario registrado
    const userDb = await UsuarioInfo.findOne({ id: userId });
    if (userDb && userDb.deviceAuths && userDb.deviceAuths.length > 0) {
      const userMainAccount = userDb.deviceAuths.find((acc) => acc.cuentaMain);
      if (userMainAccount) {
        // Verificar y refrescar si es necesario
        const isValid = await verifyToken(userMainAccount.accessToken, userMainAccount.expiresAt);
        if (!isValid) {
          const { mainAccount: refreshedAccount } = await refreshMainAccountToken(userId);
          if (refreshedAccount) {
            mainAccount = refreshedAccount;
            useDbAccount = true;
          }
        } else {
          mainAccount = userMainAccount;
          useDbAccount = true;
        }
      }
    }

    // 2. Si el usuario está registrado pero no pasó displayName, usar su propia cuenta
    if (useDbAccount && mainAccount) {
      if (!displayName) {
        if (!mainAccount.displayName) {
          const errorEmoji = getEmoji(interaction.client, 'error');
          const errorMessage = await translateForUser(userId, 'lookup.errors.noDisplayName', { emoji: errorEmoji });
          const embed = await createErrorEmbed({
            title: `${errorEmoji} Error`,
            description: errorMessage,
            interaction,
          });
          return await interaction.editReply({ embeds: [embed] });
        }
        displayName = mainAccount.displayName;
      }
    } else {
      // 3. Si NO está registrado, solo permitir si se pasa displayName
      if (!displayName) {
        const errorEmoji = getEmoji(interaction.client, 'error');
        const errorMessage = await translateForUser(userId, 'lookup.errors.noMainAccount', { emoji: errorEmoji });
        const embed = await createErrorEmbed({
          title: `${errorEmoji} Error`,
          description: errorMessage,
          interaction,
        });
        return await interaction.editReply({ embeds: [embed] });
      }

      // Usar deviceAuth.json global
      mainAccount = await refreshDeviceAuthJson();
      if (!mainAccount || !mainAccount.accessToken) {
        const errorEmoji = getEmoji(interaction.client, 'error');
        const embed = await generarEmbedError('api', {
          apiError: new Error('No deviceAuth available'),
          client: interaction.client,
        });
        return await interaction.editReply({ embeds: [embed] });
      }
    }

    // Hacer lookup del displayName (la parte que habla con Epic vive en glow-core)
    let accountData: LookupRunResult;
    try {
      accountData = await callCoreWithTimeout<LookupRunResult>('lookup.run', 60_000, {
        target: displayName!,
        accessToken: mainAccount.accessToken,
      });
    } catch (error) {
      const embed = await generarEmbedError('api', { apiError: error as Error, client: interaction.client });
      return await interaction.editReply({ embeds: [embed] });
    }

    const { externalAuths } = accountData;

    // Formatear cuentas vinculadas
    let linkedAccountsText = await translateForUser(userId, 'lookup.embed.fields.noLinked');
    if (externalAuths.length > 0) {
      linkedAccountsText = '';
      for (const auth of externalAuths) {
        const platformType = auth.type?.toLowerCase() || 'unknown';
        const accountName = auth.externalDisplayName || auth.externalId || 'Unknown';

        // Formatear según plataforma
        if (['psn', 'xbl', 'steam', 'nintendo', 'nsw'].includes(platformType)) {
          const emojiType = platformType === 'nsw' ? 'nintendo' : platformType;
          const emoji = getEmoji(interaction.client, emojiType as any);
          linkedAccountsText += `> ${emoji} "${accountName}"\n`;
        } else {
          linkedAccountsText += `> **${auth.type}** "${accountName}"\n`;
        }
      }
    }

    const embed = await createInfoEmbed({
      title: accountData.displayName,
      thumbnail: accountData.avatarIconUrl,
      fields: [
        {
          name: await translateForUser(userId, 'lookup.embed.fields.displayName'),
          value: `\`${accountData.displayName}\``,
          inline: false,
        },
        {
          name: await translateForUser(userId, 'lookup.embed.fields.accountId'),
          value: `\`${accountData.accountId}\``,
          inline: false,
        },
        {
          name: await translateForUser(userId, 'lookup.embed.fields.linkedAccounts'),
          value: linkedAccountsText,
          inline: false,
        },
      ],
      interaction,
    });

    await interaction.editReply({ embeds: [embed] });
  },
} as Command;
