import { SlashCommandBuilder, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { searchPlayersAutocomplete } from '#helpers/epic/social/searchPlayers.ts';
import type { IDeviceAuth } from '#models/UsuarioInfo.ts';
import {
  buildEpicReplyPayload,
  epicQuote,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import { buildGlanceEmbedFields } from '#helpers/commands/epic/glance/buildGlanceEmbed.ts';
import type { GlanceRunResult } from '#helpers/commands/epic/glance/types.ts';

const logger = log.commands;

const AUTOCOMPLETE_ERRORS = [
  'no_account',
  'invalid_token',
  'no_results',
  'token_expired',
  'rate_limited',
  'search_error',
  'no_search_permissions',
];

async function loadMainAccount(userId: string): Promise<IDeviceAuth | null> {
  const user = await UsuarioInfo.findOne({ id: userId });
  return user?.deviceAuths?.find((acc) => acc.cuentaMain) ?? null;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('glance')
    .setDescription('Quick Fortnite social snapshot (level, region, pass, Crew)')
    .setNameLocalizations(buildDiscordLocalizations('glance.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('glance.cmd._1'))
    .addStringOption((option) =>
      option
        .setName('jugador')
        .setDescription('Player display name or account id')
        .setNameLocalizations(buildDiscordLocalizations('glance.cmd.options.jugador.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('glance.cmd.options.jugador._1'))
        .setRequired(true)
        .setAutocomplete(true),
    )
    .setDMPermission(true),

  auth: true,
  cooldown: 5,

  async autocomplete(interaction: AutocompleteInteraction) {
    try {
      await searchPlayersAutocomplete(interaction, 'jugador', 25, {
        requireUserMain: true,
        errorKeyPrefix: 'glance.errors',
      });
    } catch (error) {
      log.epic.error({ error }, 'Glance autocomplete error');
      await interaction.respond([]);
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const inputValue = interaction.options.getString('jugador', true);

    if (AUTOCOMPLETE_ERRORS.includes(inputValue)) {
      const payload = await buildEpicReplyPayload(
        userId,
        {
          style: 'error',
          description: epicQuote(await translateForUser(userId, `glance.errors.${inputValue}`, undefined, locale)),
          footerKey: 'brand',
        },
        interaction,
        locale,
      );
      await interaction.editReply(payload);
      return;
    }

    const mainAccount = await loadMainAccount(userId);
    if (!mainAccount?.accessToken) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const author = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    try {
      const { target, profile, thumbnail } = await callCoreWithTimeout<GlanceRunResult>(
        'glance.run',
        60_000,
        { input: inputValue, accessToken: mainAccount.accessToken },
      );

      const title = await translateForUser(
        userId,
        'glance.embed.title',
        { name: target.displayName },
        locale,
      );

      const { description, fields } = await buildGlanceEmbedFields(
        interaction,
        userId,
        target.displayName,
        target.accountId,
        profile,
      );

      const payload = await buildEpicReplyPayload(
        userId,
        {
          style: 'info',
          title,
          description,
          fields,
          author,
          thumbnail,
          footerKey: 'brand',
        },
        interaction,
        locale,
      );

      await interaction.editReply(payload);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        const payload = await buildEpicReplyPayload(
          userId,
          {
            style: 'error',
            description: epicQuote(
              await translateForUser(
                userId,
                'glance.errors.playerNotFound',
                { player: inputValue },
                locale,
              ),
            ),
            footerKey: 'brand',
          },
          interaction,
          locale,
        );
        await interaction.editReply(payload);
        return;
      }
      logger.error({ error }, '[GLANCE] global profile failed');
      await replyEpicApiError(interaction, userId, error);
    }
  },
};

export default command;
