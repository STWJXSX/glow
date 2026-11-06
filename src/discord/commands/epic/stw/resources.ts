import {
  SlashCommandBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  EmbedBuilder,
} from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { searchPlayersAutocomplete } from '#helpers/epic/social/searchPlayers.ts';
import { log } from '#helpers/core/logger.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { buildInfoReplyPayload } from '#helpers/commands/discord/info/infoEmbedHelper.ts';
import {
  generateStwResourcesOnlyImage,
  STW_RESOURCES_ONLY_FILE_NAME,
} from '#managers/images/stw/resources-only/index.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';

const logger = log.commands;

/**
 * Helper MCP que soporta route="public" y returnProfile como el JS
 */
async function composeMCP(options: {
  profile: string;
  operation: string;
  route?: string;
  accountId: string;
  accessToken: string;
  returnProfile?: boolean;
  logError?: boolean;
  body?: any;
}): Promise<any> {
  const { profile, operation, route = 'client', accountId, accessToken, returnProfile = false, logError = false, body = {} } = options;
  
  try {
    const url = `${Endpoints.MCP}/${accountId}/${route}/${operation}?profileId=${profile}&rvn=-1`;
    
    logger.info({ url, accountId, operation, route, profile }, '[resources] MCP Request');

    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    logger.info({ operation, route, success: true }, '[resources] MCP Response OK');
    
    if (returnProfile) {
      return res.data.profileChanges[0].profile;
    }
    return res.data;
  } catch (err: any) {
    if (logError) {
      logger.error({ error: err?.response?.data || err, operation, route }, '[resources] MCP Error');
    }
    throw err;
  }
}

/**
 * Obtiene displayName desde accountId
 */
async function getDisplayNameFromAccountId(accountId: string, accessToken: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://account-public-service-prod.ol.epicgames.com/account/api/public/account/${accountId}`,
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data?.displayName || accountId;
  } catch (error) {
    return accountId;
  }
}

/**
 * Obtiene accountId desde displayName
 */
async function getAccountIdFromDisplayName(displayName: string, accessToken: string): Promise<{ id: string; displayName: string }> {
  const response = await axios.get(
    `https://account-public-service-prod.ol.epicgames.com/account/api/public/account/displayName/${encodeURIComponent(displayName)}`,
    {
      headers: {
        Authorization: `bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
}



const command: Command = {
  data: new SlashCommandBuilder()
    .setName('resources')
    .setDescription('Show Save the World account resources')
    .setNameLocalizations(buildDiscordLocalizations('resources.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('resources.cmd.description'))
    .addStringOption((option) =>
      option
        .setName('player')
        .setDescription('The player whose resources to view (optional, defaults to your main account)')
        .setNameLocalizations(buildDiscordLocalizations('resources.cmd.options.player.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('resources.cmd.options.player.description'))
        .setRequired(false)
        .setAutocomplete(true)
    ) as SlashCommandBuilder,
    auth: true,

  async autocomplete(interaction: AutocompleteInteraction) {
    try {
      await searchPlayersAutocomplete(interaction, 'player', 25);
    } catch (error) {
      logger.error({ error }, '[resources] Error in autocomplete');
      // SIEMPRE responder, incluso si hay error
      try {
        if (!interaction.responded) {
          await interaction.respond([]);
        }
      } catch (e) {
        logger.error({ error: e }, '[resources] Error responding to autocomplete');
      }
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;

    try {
      // Obtener usuario y cuenta principal
      const userDb = await UsuarioInfo.findOne({ id: userId });
      if (!userDb) {
        const embed = await generarEmbedError('custom', {
          descripcion: await translateForUser(userId, 'resources.errors.noToken'),
          client: interaction.client,
          interaction
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const mainAccount = userDb.deviceAuths.find((acc) => acc.cuentaMain);
      if (!mainAccount) {
        const embed = await generarEmbedError('custom', {
          descripcion: await translateForUser(userId, 'resources.errors.noToken'),
          client: interaction.client,
          interaction
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const account = mainAccount;

      const inputValue = interaction.options.getString('player');

      // Validar valores especiales del autocompletado
      const errorValues = [
        'no_account', 'invalid_token', 'no_results', 'token_expired',
        'rate_limited', 'search_error', 'bot_auth_error', 'bot_token_expired',
        'no_search_permissions', 'limited_search'
      ];

      if (inputValue && errorValues.includes(inputValue)) {
        const embed = await generarEmbedError('custom', {
          descripcion: await translateForUser(userId, 'resources.errors.searchError'),
          client: interaction.client,
          interaction
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let targetAccountId: string = '';
      let targetDisplayName: string = '';

      // Determinar targetAccountId y targetDisplayName
      if (!inputValue) {
        // Usar cuenta main del usuario
        targetAccountId = account.accountId;
        targetDisplayName = account.displayName || await translateForUser(userId, 'resources.yourAccount');
      } else {
        // Verificar si es accountId o displayName
        if (/^[a-f0-9]{32}$/i.test(inputValue)) {
          // Es accountId
          targetAccountId = inputValue;
          targetDisplayName = await getDisplayNameFromAccountId(targetAccountId, account.accessToken);
        } else {
          // Es displayName
          try {
            const accountData = await getAccountIdFromDisplayName(inputValue, account.accessToken);
            targetAccountId = accountData.id;
            targetDisplayName = accountData.displayName;
          } catch (error: any) {
            const embed = await generarEmbedError('custom', {
              descripcion: await translateForUser(userId, 'resources.errors.playerNotFound', { player: inputValue }),
              client: interaction.client,
              interaction
            });
            await interaction.editReply({ embeds: [embed] });
            return;
          }
        }
      }

      // Hacer petición MCP para obtener el perfil de campaña
      let profileData: any;
      try {
        logger.info({ targetAccountId, targetDisplayName }, '[resources] Fetching campaign profile');
        
        profileData = await composeMCP({
          profile: 'campaign',
          operation: 'QueryPublicProfile',
          route: 'public',
          accountId: targetAccountId,
          accessToken: account.accessToken,
          returnProfile: true,
          logError: true
        });
      } catch (err: any) {
        // Manejo específico para perfil no público
        if (err?.response?.data?.errorCode === 'errors.com.epicgames.fortnite.operation_forbidden' &&
          err?.response?.data?.errorMessage?.includes('Operation QueryPublicProfile is not allowed')) {

          const embed = new EmbedBuilder()
            .setColor('Red')
            .setDescription(await translateForUser(userId, 'resources.errors.profileNotPublic', { 
              player: targetDisplayName, 
              emoji: '❌' 
            }));
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        // Para cualquier otro error
        const embed = await generarEmbedError('api', {
          apiError: err,
          client: interaction.client,
          interaction
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (!profileData || !profileData.items) {
        const embed = new EmbedBuilder()
          .setColor('Red')
          .setDescription(await translateForUser(userId, 'resources.errors.noResources', { emoji: '❌' }));
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const authorData = await getMainAccountAuthor(userId, {
        accountId: targetAccountId,
        accessToken: account.accessToken,
        displayName: targetDisplayName,
      });

      let imageResult;
      try {
        imageResult = await generateStwResourcesOnlyImage({
          campaignProfile: profileData,
          displayName: targetDisplayName,
          accessToken: account.accessToken,
          accountId: targetAccountId,
          discordUserId: userId,
        });
      } catch (imageError: unknown) {
        const message = imageError instanceof Error ? imageError.message : String(imageError);
        if (message.includes('No displayable')) {
          const payload = await buildInfoReplyPayload(
            userId,
            {
              style: 'info',
              description: await translateForUser(userId, 'resources.noResourcesFound', {
                player: targetDisplayName,
              }),
              footerKey: 'brand',
            },
            interaction,
            interaction.locale,
          );
          await interaction.editReply({ embeds: payload.embeds, files: payload.files });
          return;
        }
        throw imageError;
      }

      const attachments = imageResult.pages.map((page) => new AttachmentBuilder(page.buffer, {
        name: page.fileName || STW_RESOURCES_ONLY_FILE_NAME,
      }));

      const title = await translateForUser(userId, 'resources.embed.title', {
        displayName: targetDisplayName.toUpperCase(),
      });

      let hint = `**${title}**`;
      if (imageResult.truncated) {
        hint += `\n\nShowing ${imageResult.pages.reduce((s, p) => s + p.itemCount, 0)} / ${imageResult.totalCount} resources`;
      }

      const logoPayload = await buildInfoReplyPayload(userId, { style: 'info' }, interaction, interaction.locale);
      const embeds: EmbedBuilder[] = attachments.map((file, index) => {
        const fileName = file.name ?? STW_RESOURCES_ONLY_FILE_NAME;
        const embed = logoPayload.embeds[0]?.data
          ? EmbedBuilder.from(logoPayload.embeds[0])
          : new EmbedBuilder();
        embed
          .setDescription(index === 0 ? hint : '\u200b')
          .setImage(`attachment://${fileName}`);
        if (index === 0 && authorData) {
          embed.setAuthor({ name: authorData.name, iconURL: authorData.iconURL });
        }
        return embed;
      });

      await interaction.editReply({
        embeds,
        files: [...(logoPayload.files ?? []), ...attachments],
        components: [],
      });

    } catch (error: any) {
      logger.error({ error }, 'Error en comando resources');
      try {
        const embed = await generarEmbedError('custom', {
          descripcion: await translateForUser(userId, 'resources.errors.unexpected'),
          client: interaction.client,
          interaction
        });
        await interaction.editReply({ embeds: [embed], components: [] });
      } catch (e) {
        logger.error({ error: e }, 'Error al enviar embed de error');
      }
    }
  },
};

export default command;
