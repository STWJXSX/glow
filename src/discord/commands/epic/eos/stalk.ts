import { SlashCommandBuilder, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { searchPlayersAutocomplete } from '#helpers/epic/social/searchPlayers.ts';
import type { IDeviceAuth } from '#models/UsuarioInfo.ts';
import {
  buildEpicReplyPayload,
  epicEmojiLine,
  epicQuote,
  epicSection,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import type {
  StalkRunResult,
  StalkSessionResult,
} from '#helpers/commands/epic/stalk/types.ts';
import { isInFortniteSession, type ParsedFortnitePresence } from '#helpers/commands/epic/stalk/stalkPresence.ts';

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

function discordTs(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return `<t:${Math.floor(ms / 1000)}:F> · <t:${Math.floor(ms / 1000)}:R>`;
}

async function buildPrivatePlayersBlock(
  interaction: ChatInputCommandInteraction,
  userId: string,
  accountIds: string[],
  names: Record<string, string>,
): Promise<string> {
  const locale = interaction.locale;
  const none = await translateForUser(userId, 'stalk.embed.none', undefined, locale);
  if (!accountIds.length) return epicQuote(none);

  const lines = accountIds.map((id) => `> ${names[id] ?? id}`);
  return lines.join('\n');
}

async function stalkField(
  userId: string,
  locale: string,
  key: string,
): Promise<string> {
  return translateForUser(userId, `stalk.embed.fields.${key}`, undefined, locale);
}

async function formatPartyLine(
  userId: string,
  locale: string,
  p: ParsedFortnitePresence,
): Promise<string | null> {
  if (p.partySize == null) return null;
  const partyLabel = await stalkField(userId, locale, 'party');
  let mode: string;
  if (p.partySize <= 1) mode = await stalkField(userId, locale, 'partyAlone');
  else if (p.partySize === 2) mode = await stalkField(userId, locale, 'partyDuo');
  else if (p.partySize <= 4) mode = await stalkField(userId, locale, 'partySquad');
  else mode = await stalkField(userId, locale, 'partyGroup');

  const size = p.partyMaxSize != null
    ? `\`${p.partySize}/${p.partyMaxSize}\``
    : `\`${p.partySize}\``;
  return `**${partyLabel}:** ${mode} · ${size}`;
}

async function buildPresenceDetailLines(
  interaction: ChatInputCommandInteraction,
  userId: string,
  locale: string,
  data: StalkSessionResult,
): Promise<string[]> {
  const client = interaction.client;
  const yes = await translateForUser(userId, 'stalk.embed.yes', undefined, locale);
  const no = await translateForUser(userId, 'stalk.embed.no', undefined, locale);
  const lines: string[] = [];

  if (!data.presence) return lines;

  const showKey = (data.presence.show || 'online').toLowerCase();
  const showText = await translateForUser(
    userId,
    `stalk.embed.presence.${showKey}`,
    undefined,
    locale,
  ).catch(() => showKey);

  const statusLabel = await stalkField(userId, locale, 'status');
  if (!data.presence.available) {
    const offlineText = await translateForUser(userId, 'stalk.embed.presence.offline', undefined, locale);
    lines.push(`**${statusLabel}:** ${offlineText}`);
    return lines;
  }

  lines.push(`**${statusLabel}:** **${showText}**`);

  const p = data.parsedPresence;
  if (p?.platform && p.platform !== '—') {
    const platformLabel = await stalkField(userId, locale, 'platform');
    lines.push(`**${platformLabel}:** \`${p.platform}\``);
  }

  if (p) {
    if (isInFortniteSession(p)) {
      const modeLabel = await stalkField(userId, locale, 'mode');
      const subGame = await translateForUser(userId, `stalk.embed.subGame.${p.subGameKey}`, undefined, locale);
      lines.push(`**${modeLabel}:** ${subGame}`);
    }

    const activity = p.activity || p.statusText;
    if (activity && activity !== '—' && activity.toLowerCase() !== showText.toLowerCase()) {
      const activityLabel = await stalkField(userId, locale, 'activity');
      lines.push(`**${activityLabel}:** ${activity}`);
    }

    const partyLine = await formatPartyLine(userId, locale, p);
    if (partyLine) lines.push(partyLine);

    if (p.playlistId !== '—') {
      const playlistLabel = await stalkField(userId, locale, 'playlist');
      lines.push(`**${playlistLabel}:** \`${p.playlistId}\``);
    }

    if (p.island !== '—') {
      const islandLabel = await stalkField(userId, locale, 'island');
      lines.push(`**${islandLabel}:** \`${p.island}\``);
    }

    if (p.subGameKey === 'stw' && p.homeBaseRating != null) {
      const homeLabel = await stalkField(userId, locale, 'homeRating');
      lines.push(`**${homeLabel}:** \`${p.homeBaseRating}\``);
    }

    if (p.inZone) {
      const inIslandLabel = await stalkField(userId, locale, 'inIsland');
      lines.push(`**${inIslandLabel}:** ${epicEmojiLine(client, 'success', yes)}`);
    }

    if (p.unjoinableMatch || (p.playersAlive != null && p.playersAlive > 0)) {
      const inMatchLabel = await stalkField(userId, locale, 'inMatch');
      const aliveLabel = await stalkField(userId, locale, 'playersAlive');
      const parts = [`**${inMatchLabel}:** ${epicEmojiLine(client, 'success', yes)}`];
      if (p.playersAlive != null) parts.push(`**${aliveLabel}:** \`${p.playersAlive}\``);
      if (p.kills != null && p.kills > 0) {
        const killsLabel = await stalkField(userId, locale, 'kills');
        parts.push(`**${killsLabel}:** \`${p.kills}\``);
      }
      lines.push(parts.join(' · '));
    } else if (p.gameState !== '—') {
      const stateLabel = await stalkField(userId, locale, 'state');
      lines.push(`**${stateLabel}:** \`${p.gameState}\``);
    }

    if (p.serverPlayerCount != null && p.serverPlayerCount > 0 && !p.playersAlive) {
      const aliveLabel = await stalkField(userId, locale, 'playersAlive');
      lines.push(`**${aliveLabel}:** \`${p.serverPlayerCount}\``);
    }

    const joinableLabel = await stalkField(userId, locale, 'joinable');
    const joinableVal = p.joinable ? getEmoji(client, 'success') : getEmoji(client, 'error');
    lines.push(`**${joinableLabel}:** ${joinableVal}`);

    if (p.partyPrivate) {
      const privateLabel = await stalkField(userId, locale, 'privateParty');
      lines.push(`**${privateLabel}:** ${epicEmojiLine(client, 'success', yes)}`);
    }
  }

  return lines;
}

async function buildStalkEmbedContent(
  interaction: ChatInputCommandInteraction,
  userId: string,
  data: StalkRunResult,
): Promise<{ description: string; fields: Array<{ name: string; value: string; inline?: boolean }> }> {
  const client = interaction.client;
  const locale = interaction.locale;
  const yes = await translateForUser(userId, 'stalk.embed.yes', undefined, locale);
  const no = await translateForUser(userId, 'stalk.embed.no', undefined, locale);
  const unknown = await translateForUser(userId, 'stalk.embed.unknown', undefined, locale);

  const playerLabel = await translateForUser(userId, 'stalk.embed.fields.player', undefined, locale);
  const lines: string[] = [`**${playerLabel}:** \`${data.targetDisplayName}\``];

  const isFriend = data.friendship?.isFriend === true;

  if (data.friendship && !isFriend) {
    const notFriendNotice = await translateForUser(
      userId,
      'stalk.embed.notFriendNotice',
      { name: data.targetDisplayName },
      locale,
    );
    lines.push(epicQuote(epicEmojiLine(client, 'warning', notFriendNotice)));
  }

  if (isFriend) {
    const presenceLines = await buildPresenceDetailLines(interaction, userId, locale, data);
    if (presenceLines.length) {
      lines.push(epicQuote(presenceLines.join('\n')));
    }
  }

  if (data.friendship?.isFriend) {
    const friendshipLabel = await translateForUser(userId, 'stalk.embed.fields.friendship', undefined, locale);
    const since = data.friendship.created
      ? `<t:${Math.floor(Date.parse(data.friendship.created) / 1000)}:D>`
      : unknown;
    const friendshipValue = await translateForUser(
      userId,
      'stalk.embed.friendshipFormat',
      { date: since, count: String(data.friendship.mutual) },
      locale,
    );
    lines.push(`**${friendshipLabel}:** ${friendshipValue}`);
  }

  if (data.lastOnline && data.state !== 'online' && data.state !== 'inMatch') {
    const lastOnlineLabel = await translateForUser(userId, 'stalk.embed.fields.lastOnline', undefined, locale);
    lines.push(`**${lastOnlineLabel}:** ${discordTs(data.lastOnline)}`);
  }

  if (data.interaction) {
    const recentLabel = await translateForUser(userId, 'stalk.embed.fields.recent', undefined, locale);
    const interactionValue = await translateForUser(
      userId,
      'stalk.embed.interactionFormat',
      {
        type: data.interaction.type,
        ts: String(Math.floor(data.interaction.happenedAt / 1000)),
        count: String(data.interaction.count),
      },
      locale,
    );
    lines.push(`**${recentLabel}:** ${interactionValue}`);
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (data.session?.id && data.sessionEndpoints) {
    const session = data.session;
    const endpoints = data.sessionEndpoints;
    const matchLabel = await translateForUser(userId, 'stalk.embed.fields.match', undefined, locale);
    const regionLabel = await translateForUser(userId, 'stalk.embed.fields.region', undefined, locale);
    const gamemodeLabel = await translateForUser(userId, 'stalk.embed.fields.gamemode', undefined, locale);
    const bucketLabel = await translateForUser(userId, 'stalk.embed.fields.bucket', undefined, locale);
    const startedLabel = await translateForUser(userId, 'stalk.embed.fields.started', undefined, locale);
    const serverLabel = await translateForUser(userId, 'stalk.embed.fields.serverIp', undefined, locale);
    const realPlayersLabel = await translateForUser(userId, 'stalk.embed.fields.realPlayers', undefined, locale);
    const privateLabel = await translateForUser(userId, 'stalk.embed.fields.privatePlayers', undefined, locale);

    const bucketType = await translateForUser(
      userId,
      `mm.embed.bucketTypes.${endpoints.bucketInfo.typeKey}`,
      undefined,
      locale,
    );
    const bucketParts = [bucketType];
    if (endpoints.bucketInfo.subregion) bucketParts.push(endpoints.bucketInfo.subregion);
    if (endpoints.playlist && endpoints.playlist !== 'N/A') bucketParts.push(endpoints.playlist);

    const startedValue = session.started
      ? epicEmojiLine(client, 'success', yes)
      : epicEmojiLine(client, 'error', no);

    const matchLines = [
      `**${matchLabel}:** ${epicEmojiLine(client, 'success', yes)}`,
      `**${regionLabel}:** \`${endpoints.region}\` · \`${endpoints.subRegion}\``,
      `**${gamemodeLabel}:** \`${endpoints.gameMode}\` · \`${endpoints.playlist}\``,
      `**${bucketLabel}:** ${bucketParts.join(' · ')} · \`${endpoints.bucket}\``,
      `**${startedLabel}:** ${startedValue}`,
      `**${serverLabel}:** ${endpoints.dsEndpoint} · CF: \`${endpoints.cfEndpoint}\``,
      `**${realPlayersLabel}:** \`${session.totalPlayers ?? 0}\``,
    ];

    const privateBlock = await buildPrivatePlayersBlock(interaction, userId, data.privatePlayers, data.privatePlayerNames);
    if (data.privatePlayers.length > 0) {
      matchLines.push(`**${privateLabel}:**`, privateBlock);
    }

    fields.push({
      name: epicSection(matchLabel),
      value: epicQuote(matchLines.join('\n')),
      inline: false,
    });
  }

  return { description: lines.join('\n\n'), fields };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('stalk')
    .setDescription('Look up a Fortnite player activity')
    .setNameLocalizations(buildDiscordLocalizations('stalk.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('stalk.cmd._1'))
    .addStringOption((option) =>
      option
        .setName('displayname')
        .setDescription('Player display name')
        .setNameLocalizations(buildDiscordLocalizations('stalk.cmd.options.displayname.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('stalk.cmd.options.displayname._1'))
        .setRequired(true)
        .setAutocomplete(true),
    )
    .setDMPermission(true),

  auth: true,
  cooldown: 5,

  async autocomplete(interaction: AutocompleteInteraction) {
    try {
      await searchPlayersAutocomplete(interaction, 'displayname', 25, { requireUserMain: true });
    } catch (error) {
      log.epic.error({ error }, 'Stalk autocomplete error');
      await interaction.respond([]);
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const inputValue = interaction.options.getString('displayname', true);

    if (AUTOCOMPLETE_ERRORS.includes(inputValue)) {
      const payload = await buildEpicReplyPayload(
        userId,
        {
          style: 'error',
          description: epicQuote(await translateForUser(userId, `stalk.errors.${inputValue}`, undefined, locale)),
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
      const data = await callCoreWithTimeout<StalkRunResult>('stalk.run', 120_000, {
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
        target: inputValue,
      });

      const titleKey =
        data.state === 'inMatch'
          ? 'stalk.embed.title.inMatch'
          : data.state === 'online'
            ? 'stalk.embed.title.online'
            : data.state === 'offline'
              ? 'stalk.embed.title.offline'
              : 'stalk.embed.title.unknown';

      const title = await translateForUser(
        userId,
        titleKey,
        { name: data.targetDisplayName },
        locale,
      );

      let description: string | undefined;
      const isFriend = data.friendship?.isFriend === true;

      if (data.state === 'offline' && isFriend) {
        description = epicQuote(
          await translateForUser(
            userId,
            'stalk.embed.offlineDescription',
            { name: data.targetDisplayName },
            locale,
          ),
        );
      } else if (data.state === 'unknown' && isFriend) {
        description = epicQuote(
          await translateForUser(
            userId,
            'stalk.embed.unknownDescription',
            { name: data.targetDisplayName },
            locale,
          ),
        );
      } else if (!isFriend && data.friendship && !data.session?.id) {
        description = epicQuote(
          await translateForUser(
            userId,
            'stalk.embed.notFriendLimited',
            { name: data.targetDisplayName },
            locale,
          ),
        );
      }

      const { description: body, fields } = await buildStalkEmbedContent(
        interaction,
        userId,
        data,
      );

      const embedDescription = description ? `${description}\n\n${body}` : body;

      const payload = await buildEpicReplyPayload(
        userId,
        {
          style: 'info',
          title,
          description: embedDescription,
          fields,
          author,
          thumbnail: data.targetAvatarUrl,
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
                'stalk.errors.playerNotFound',
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
      logger.error({ error }, '[STALK] lookup failed');
      await replyEpicApiError(interaction, userId, error);
    }
  },
};

export default command;
