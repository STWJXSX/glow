import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import {
  buildEpicReplyPayload,
  epicEmojiLine,
  epicQuote,
  epicSection,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  extractSessionFromFindPlayer,
  fetchSelfMatchmakingSession,
  getSessionEndpoints,
  lookupAccountDisplayNames,
} from '#helpers/commands/discord/matchmaking/mmSession.ts';

const logger = log.commands;

async function buildPrivatePlayersBlock(
  interaction: ChatInputCommandInteraction,
  userId: string,
  accountIds: string[],
  accessToken: string,
): Promise<string> {
  const locale = interaction.locale;
  const none = await translateForUser(userId, 'mm.embed.none', undefined, locale);
  if (!accountIds.length) return epicQuote(none);

  const names = await lookupAccountDisplayNames(accountIds, accessToken, 3);
  const lines = accountIds.map((id) => `> ${names.get(id) ?? id}`);
  return lines.join('\n');
}

async function buildMmEmbedFields(
  interaction: ChatInputCommandInteraction,
  userId: string,
  inMatch: boolean,
  session: ReturnType<typeof getSessionEndpoints> | null,
  started: boolean,
  realPlayers: number,
  privatePlayers: string[],
  accessToken: string,
) {
  const client = interaction.client;
  const locale = interaction.locale;

  const yes = await translateForUser(userId, 'mm.embed.yes', undefined, locale);
  const no = await translateForUser(userId, 'mm.embed.no', undefined, locale);

  const matchLabel = await translateForUser(userId, 'mm.embed.fields.match', undefined, locale);
  const regionLabel = await translateForUser(userId, 'mm.embed.fields.region', undefined, locale);
  const gamemodeLabel = await translateForUser(userId, 'mm.embed.fields.gamemode', undefined, locale);
  const bucketLabel = await translateForUser(userId, 'mm.embed.fields.bucket', undefined, locale);
  const startedLabel = await translateForUser(userId, 'mm.embed.fields.started', undefined, locale);
  const serverLabel = await translateForUser(userId, 'mm.embed.fields.serverIp', undefined, locale);
  const realPlayersLabel = await translateForUser(userId, 'mm.embed.fields.realPlayers', undefined, locale);
  const privateLabel = await translateForUser(userId, 'mm.embed.fields.privatePlayers', undefined, locale);

  const matchValue = inMatch
    ? epicEmojiLine(client, 'success', yes)
    : epicEmojiLine(client, 'info', no);

  if (!inMatch || !session) {
    return [];
  }

  const bucketType = await translateForUser(
    userId,
    `mm.embed.bucketTypes.${session.bucketInfo.typeKey}`,
    undefined,
    locale,
  );
  const bucketParts = [bucketType];
  if (session.bucketInfo.subregion) bucketParts.push(session.bucketInfo.subregion);
  if (session.playlist && session.playlist !== 'N/A') bucketParts.push(session.playlist);

  const startedValue = await fetchStartedValue(interaction, userId, started);

  return [
    { name: epicSection(matchLabel), value: matchValue, inline: false },
    {
      name: epicSection(regionLabel),
      value: `\`${session.region}\` | \`${session.subRegion}\``,
      inline: false,
    },
    {
      name: epicSection(gamemodeLabel),
      value: `\`${session.gameMode}\` | \`${session.playlist}\``,
      inline: false,
    },
    {
      name: epicSection(bucketLabel),
      value: epicQuote(`${bucketParts.join(' · ')}\n\`${session.bucket}\``),
      inline: false,
    },
    { name: epicSection(startedLabel), value: startedValue, inline: false },
    {
      name: epicSection(serverLabel),
      value: `${session.dsEndpoint} | CF: ${session.cfEndpoint}`,
      inline: false,
    },
    {
      name: epicSection(realPlayersLabel),
      value: `\`${realPlayers}\``,
      inline: true,
    },
    {
      name: epicSection(privateLabel),
      value: await buildPrivatePlayersBlock(interaction, userId, privatePlayers, accessToken),
      inline: false,
    },
  ];
}

async function fetchStartedValue(
  interaction: ChatInputCommandInteraction,
  userId: string,
  started: boolean,
): Promise<string> {
  const client = interaction.client;
  const locale = interaction.locale;
  const yes = await translateForUser(userId, 'mm.embed.yes', undefined, locale);
  const no = await translateForUser(userId, 'mm.embed.no', undefined, locale);
  return started ? epicEmojiLine(client, 'success', yes) : epicEmojiLine(client, 'error', no);
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('mm')
    .setDescription('View your current Fortnite matchmaking session')
    .setNameLocalizations(buildDiscordLocalizations('mm.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('mm.cmd._1'))
    .setDMPermission(true),

  auth: true,
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const locale = interaction.locale;

    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user?.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
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
      const raw = await fetchSelfMatchmakingSession(mainAccount.accountId, mainAccount.accessToken);
      const sessionData = extractSessionFromFindPlayer(raw);
      const inMatch = Boolean(sessionData?.id);
      const endpoints = sessionData ? getSessionEndpoints(sessionData) : null;
      const realPlayers = sessionData?.totalPlayers ?? 0;
      const privatePlayers = sessionData?.privatePlayers ?? [];
      const started = Boolean(sessionData?.started);

      const title = await translateForUser(
        userId,
        inMatch ? 'mm.embed.title' : 'mm.embed.offlineTitle',
        undefined,
        locale,
      );

      if (!inMatch) {
        const description = epicQuote(
          await translateForUser(userId, 'mm.embed.offlineDescription', undefined, locale),
        );
        const payload = await buildEpicReplyPayload(
          userId,
          {
            style: 'info',
            title,
            description,
            author,
            footerKey: 'brand',
          },
          interaction,
          locale,
        );
        await interaction.editReply(payload);
        return;
      }

      const fields = await buildMmEmbedFields(
        interaction,
        userId,
        inMatch,
        endpoints,
        started,
        realPlayers,
        privatePlayers,
        mainAccount.accessToken,
      );

      const payload = await buildEpicReplyPayload(
        userId,
        {
          style: 'info',
          title,
          fields,
          author,
          footerKey: 'brand',
        },
        interaction,
        locale,
      );

      await interaction.editReply(payload);
    } catch (error) {
      logger.error({ error }, '[MM] session lookup failed');
      await replyEpicApiError(interaction, userId, error);
    }
  },
};

export default command;
