/**
 * COMANDO /FRIENDS
 * Full friend management: list, summary, add, remove, accept, reject, cancel, block, unblock,
 * accept-all, remove-all, clear-all (bulk DELETE endpoint).
 *
 * Subcommand groups:
 *   /friends list
 *   /friends summary
 *   /friends add <user>
 *   /friends remove <friend>        (autocomplete)
 *   /friends accept <friend>        (autocomplete incoming)
 *   /friends reject <friend>        (autocomplete incoming)
 *   /friends cancel <friend>        (autocomplete outgoing)
 *   /friends block <user>
 *   /friends unblock <user>
 *   /friends accept-all
 *   /friends remove-all
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { callCore, callCoreWithTimeout } from '#api/glowCore.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import {
  buildEpicReplyPayload,
  epicEmojiLine,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  translateEpic,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_PAGINATION_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';

const logger = log.commands;
const FRIENDS_PER_PAGE = 15;

// ── Helpers ───────────────────────────────────────────────

interface FriendEntry {
  accountId: string;
  displayName: string;
}

/** Helper to get refreshed account for handlers */
async function getAuthAccount(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;

  const userDb = await UsuarioInfo.findOne({ id: userId });
  if (!userDb) {
    await replyEpicCredentialError(interaction, userId, 'noCuenta');
    return null;
  }

  const mainAccount = userDb.deviceAuths.find((a: any) => a.cuentaMain);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return null;
  }

  const account = mainAccount;

  return { userDb, account, userId };
}

function parseAutocompleteValue(raw: string): { displayName: string; accountId: string } | null {
  const parts = raw.split('|');
  if (parts.length !== 2) return null;
  return { displayName: parts[0], accountId: parts[1] };
}

// ── Subcommand Handlers ──────────────────────────────────

async function handleSummary(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;

  try {
    const summary = await callCore<{ friends: number; incoming: number; outgoing: number; blocked: number }>(
      'friends.summary',
      account.accountId,
      account.accessToken,
    );

    const friendCount = summary.friends;
    const incomingCount = summary.incoming;
    const outgoingCount = summary.outgoing;
    const blockedCount = summary.blocked;

    const author = await getEpicAuthor(userId);
    const payload = await buildEpicReplyPayload(userId, {
      style: 'info',
      title: await translateForUser(userId, 'friends.summary.title', undefined, interaction.locale),
      fields: [
        { name: await translateForUser(userId, 'friends.summary.friends', undefined, interaction.locale), value: `\`${friendCount}\``, inline: true },
        { name: await translateForUser(userId, 'friends.summary.incoming', undefined, interaction.locale), value: `\`${incomingCount}\``, inline: true },
        { name: await translateForUser(userId, 'friends.summary.outgoing', undefined, interaction.locale), value: `\`${outgoingCount}\``, inline: true },
        { name: await translateForUser(userId, 'friends.summary.blocked', undefined, interaction.locale), value: `\`${blockedCount}\``, inline: true },
      ],
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (err: any) {
    logger.error({ error: err.message }, '[FRIENDS] summary error');
    await replyEpicApiError(interaction, userId, err);
  }
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;
  const locale = interaction.locale;

  try {
    const friends = await callCoreWithTimeout<FriendEntry[]>('friends.list', 30_000, account.accountId, account.accessToken);
    friends.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

    const author = await getEpicAuthor(userId);
    const title = await translateForUser(userId, 'friends.list.title', undefined, locale);

    if (friends.length === 0) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'info',
        title,
        description: await translateForUser(userId, 'friends.list.empty', undefined, locale),
        author,
      });
      return;
    }

    let page = 1;
    const totalPages = Math.max(1, Math.ceil(friends.length / FRIENDS_PER_PAGE));

    const buildPage = async (currentPage: number) => {
      const start = (currentPage - 1) * FRIENDS_PER_PAGE;
      const slice = friends.slice(start, start + FRIENDS_PER_PAGE);
      const description = slice
        .map((friend, index) => `**${start + index + 1}.** ${friend.displayName}`)
        .join('\n');

      const footerText = totalPages > 1
        ? await translateForUser(userId, 'friends.list.footer', {
          current: String(currentPage),
          total: String(totalPages),
          count: String(friends.length),
        }, locale)
        : await translateForUser(userId, 'friends.list.count', { count: String(friends.length) }, locale);

      const payload = await buildEpicReplyPayload(userId, {
        style: 'info',
        title,
        description,
        footerText,
        author,
      }, interaction, locale);

      if (totalPages <= 1) return payload;

      const prevLabel = await translateForUser(userId, 'friends.list.prev', undefined, locale);
      const nextLabel = await translateForUser(userId, 'friends.list.next', undefined, locale);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('friends_list_prev')
          .setLabel(prevLabel)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage <= 1),
        new ButtonBuilder()
          .setCustomId('friends_list_next')
          .setLabel(nextLabel)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage >= totalPages),
      );

      return { ...payload, components: [row] };
    };

    await interaction.editReply(await buildPage(page));

    if (totalPages <= 1) return;

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      idle: EPIC_PAGINATION_IDLE_MS,
    });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({
          content: await translateForUser(userId, 'epic.errors.onlyAuthor', undefined, locale),
          ephemeral: true,
        });
        return;
      }

      if (btn.customId === 'friends_list_prev') {
        page = Math.max(1, page - 1);
      } else if (btn.customId === 'friends_list_next') {
        page = Math.min(totalPages, page + 1);
      }

      await btn.update(await buildPage(page));
    });

    collector.on('end', async (_collected, reason) => {
      if (!isCollectorIdle(reason)) return;
      try {
        const inactive = await translateForUser(userId, 'epic.inactivePagination', undefined, locale);
        await editReplyInactive(interaction, inactive);
      } catch { /* message may be gone */ }
    });
  } catch (err: any) {
    logger.error({ error: err.message }, '[FRIENDS] list error');
    await replyEpicApiError(interaction, userId, err);
  }
}

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;
  const client = interaction.client;
  const input = interaction.options.getString('user', true).trim();

  try {
    const target = await callCore<FriendEntry>('friends.add', account.accountId, account.accessToken, input);

    const author = await getEpicAuthor(userId);
    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: epicEmojiLine(client, 'success', await translateForUser(userId, 'friends.add.success', { name: target.displayName }, interaction.locale)),
      author,
      timestamp: true,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err.message || 'Unknown error';
    logger.error({ error: msg }, '[FRIENDS] add error');
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: epicEmojiLine(client, 'error', msg),
    });
  }
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;
  const client = interaction.client;
  const raw = interaction.options.getString('friend', true);
  const parsed = parseAutocompleteValue(raw);

  const targetId = parsed?.accountId ?? raw;
  const targetName = parsed?.displayName ?? raw;

  try {
    await callCore('friends.remove', account.accountId, account.accessToken, targetId);

    const author = await getEpicAuthor(userId);
    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: epicEmojiLine(client, 'success', await translateForUser(userId, 'friends.remove.success', { name: targetName }, interaction.locale)),
      author,
      timestamp: true,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err.message || 'Unknown error';
    logger.error({ error: msg }, '[FRIENDS] remove error');
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: epicEmojiLine(client, 'error', msg),
    });
  }
}

async function handleAccept(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;
  const client = interaction.client;
  const raw = interaction.options.getString('friend', true);
  const parsed = parseAutocompleteValue(raw);

  const targetId = parsed?.accountId ?? raw;
  const targetName = parsed?.displayName ?? raw;

  try {
    await callCore('friends.accept', account.accountId, account.accessToken, targetId);

    const author = await getEpicAuthor(userId);
    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: epicEmojiLine(client, 'success', await translateForUser(userId, 'friends.accept.success', { name: targetName }, interaction.locale)),
      author,
      timestamp: true,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err.message || 'Unknown error';
    logger.error({ error: msg }, '[FRIENDS] accept error');
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: epicEmojiLine(client, 'error', msg),
    });
  }
}

async function handleReject(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;
  const client = interaction.client;
  const raw = interaction.options.getString('friend', true);
  const parsed = parseAutocompleteValue(raw);

  const targetId = parsed?.accountId ?? raw;
  const targetName = parsed?.displayName ?? raw;

  try {
    await callCore('friends.reject', account.accountId, account.accessToken, targetId);

    const author = await getEpicAuthor(userId);
    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: epicEmojiLine(client, 'success', await translateForUser(userId, 'friends.reject.success', { name: targetName }, interaction.locale)),
      author,
      timestamp: true,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err.message || 'Unknown error';
    logger.error({ error: msg }, '[FRIENDS] reject error');
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: epicEmojiLine(client, 'error', msg),
    });
  }
}

async function handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;
  const client = interaction.client;
  const raw = interaction.options.getString('friend', true);
  const parsed = parseAutocompleteValue(raw);

  const targetId = parsed?.accountId ?? raw;
  const targetName = parsed?.displayName ?? raw;

  try {
    await callCore('friends.cancel', account.accountId, account.accessToken, targetId);

    const author = await getEpicAuthor(userId);
    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: epicEmojiLine(client, 'success', await translateForUser(userId, 'friends.cancel.success', { name: targetName }, interaction.locale)),
      author,
      timestamp: true,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err.message || 'Unknown error';
    logger.error({ error: msg }, '[FRIENDS] cancel error');
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: epicEmojiLine(client, 'error', msg),
    });
  }
}

async function handleBlock(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;
  const client = interaction.client;
  const input = interaction.options.getString('user', true).trim();

  try {
    const target = await callCore<FriendEntry>('friends.block', account.accountId, account.accessToken, input);

    const author = await getEpicAuthor(userId);
    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: epicEmojiLine(client, 'success', await translateForUser(userId, 'friends.block.success', { name: target.displayName }, interaction.locale)),
      author,
      timestamp: true,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err.message || 'Unknown error';
    logger.error({ error: msg }, '[FRIENDS] block error');
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: epicEmojiLine(client, 'error', msg),
    });
  }
}

async function handleUnblock(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;
  const client = interaction.client;
  const input = interaction.options.getString('user', true).trim();

  try {
    const target = await callCore<FriendEntry>('friends.unblock', account.accountId, account.accessToken, input);

    const author = await getEpicAuthor(userId);
    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: epicEmojiLine(client, 'success', await translateForUser(userId, 'friends.unblock.success', { name: target.displayName }, interaction.locale)),
      author,
      timestamp: true,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err.message || 'Unknown error';
    logger.error({ error: msg }, '[FRIENDS] unblock error');
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: epicEmojiLine(client, 'error', msg),
    });
  }
}

async function handleAcceptAll(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;
  const client = interaction.client;

  try {
    const result = await callCoreWithTimeout<{ accepted: number; total: number }>(
      'friends.acceptAll',
      60_000,
      account.accountId,
      account.accessToken,
    );
    if (result.total === 0) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        description: epicEmojiLine(client, 'error', await translateForUser(userId, 'friends.acceptAll.noRequests', undefined, interaction.locale)),
      });
      return;
    }

    const author = await getEpicAuthor(userId);
    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: epicEmojiLine(client, 'success', await translateForUser(userId, 'friends.acceptAll.success', {
        accepted: String(result.accepted),
        total: String(result.total),
      }, interaction.locale)),
      author,
      timestamp: true,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err.message || 'Unknown error';
    logger.error({ error: msg }, '[FRIENDS] accept-all error');
    await replyEpicApiError(interaction, userId, err);
  }
}

async function handleRemoveAll(interaction: ChatInputCommandInteraction): Promise<void> {
  const auth = await getAuthAccount(interaction);
  if (!auth) return;
  const { account, userId } = auth;
  const client = interaction.client;

  try {
    await callCoreWithTimeout('friends.removeAll', 30_000, account.accountId, account.accessToken);

    const author = await getEpicAuthor(userId);
    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: epicEmojiLine(client, 'success', await translateForUser(userId, 'friends.removeAll.success', undefined, interaction.locale)),
      author,
      timestamp: true,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err.message || 'Unknown error';
    logger.error({ error: msg }, '[FRIENDS] remove-all error');
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: epicEmojiLine(client, 'error', msg),
    });
  }
}

// ── Autocomplete ─────────────────────────────────────────

async function handleFriendAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focusedValue = interaction.options.getFocused();
  const discordId = interaction.user.id;

  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (!userInfo?.deviceAuths?.length) { await interaction.respond([]); return; }

    const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
    if (!mainAccount) { await interaction.respond([]); return; }

    const { account } = await refreshAccountToken(userInfo, mainAccount.accountId);
    if (!account) { await interaction.respond([]); return; }

    const friends = await callCoreWithTimeout<FriendEntry[]>('friends.list', 30_000, account.accountId, account.accessToken);
    const filtered = friends.filter(f =>
      f.displayName.toLowerCase().includes(focusedValue.toLowerCase()),
    );

    await interaction.respond(
      filtered.slice(0, 25).map(f => ({
        name: f.displayName,
        value: `${f.displayName}|${f.accountId}`,
      })),
    );
  } catch (err: any) {
    logger.error({ error: err.message }, '[FRIENDS] autocomplete error');
    await interaction.respond([]);
  }
}

async function handleIncomingAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focusedValue = interaction.options.getFocused();
  const discordId = interaction.user.id;

  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (!userInfo?.deviceAuths?.length) { await interaction.respond([]); return; }

    const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
    if (!mainAccount) { await interaction.respond([]); return; }

    const { account } = await refreshAccountToken(userInfo, mainAccount.accountId);
    if (!account) { await interaction.respond([]); return; }

    const incoming = await callCore<FriendEntry[]>('friends.requests', account.accountId, account.accessToken, 'incoming');
    const filtered = incoming.filter(f =>
      f.displayName.toLowerCase().includes(focusedValue.toLowerCase()),
    );

    await interaction.respond(
      filtered.slice(0, 25).map(f => ({
        name: f.displayName,
        value: `${f.displayName}|${f.accountId}`,
      })),
    );
  } catch (err: any) {
    logger.error({ error: err.message }, '[FRIENDS] incoming autocomplete error');
    await interaction.respond([]);
  }
}

async function handleOutgoingAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focusedValue = interaction.options.getFocused();
  const discordId = interaction.user.id;

  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (!userInfo?.deviceAuths?.length) { await interaction.respond([]); return; }

    const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
    if (!mainAccount) { await interaction.respond([]); return; }

    const { account } = await refreshAccountToken(userInfo, mainAccount.accountId);
    if (!account) { await interaction.respond([]); return; }

    const outgoing = await callCore<FriendEntry[]>('friends.requests', account.accountId, account.accessToken, 'outgoing');
    const filtered = outgoing.filter(f =>
      f.displayName.toLowerCase().includes(focusedValue.toLowerCase()),
    );

    await interaction.respond(
      filtered.slice(0, 25).map(f => ({
        name: f.displayName,
        value: `${f.displayName}|${f.accountId}`,
      })),
    );
  } catch (err: any) {
    logger.error({ error: err.message }, '[FRIENDS] outgoing autocomplete error');
    await interaction.respond([]);
  }
}

// ── Command definition ───────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('friends')
    .setDescription('Manage your Epic Games friends')
    .setNameLocalizations(buildDiscordLocalizations('friends.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._1'))
    .setDMPermission(true)
    // list
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Browse your Epic Games friends list')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.list.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._2')),
    )
    // summary
    .addSubcommand(sub =>
      sub
        .setName('summary')
        .setDescription('View friend counts and pending requests')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.summary.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._17')),
    )
    // add
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Send a friend request')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.add.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._3'))
        .addStringOption(opt =>
          opt
            .setName('user')
            .setDescription('Display name or account ID')
            .setNameLocalizations(buildDiscordLocalizations('friends.cmd.options.user.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._4'))
            .setRequired(true),
        ),
    )
    // remove
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a friend')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.remove.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._5'))
        .addStringOption(opt =>
          opt
            .setName('friend')
            .setDescription('Friend to remove')
            .setNameLocalizations(buildDiscordLocalizations('friends.cmd.options.friend.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._6'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    // accept
    .addSubcommand(sub =>
      sub
        .setName('accept')
        .setDescription('Accept an incoming friend request')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.accept.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._7'))
        .addStringOption(opt =>
          opt
            .setName('friend')
            .setDescription('Request to accept')
            .setNameLocalizations(buildDiscordLocalizations('friends.cmd.options.friend.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._8'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    // reject
    .addSubcommand(sub =>
      sub
        .setName('reject')
        .setDescription('Reject an incoming friend request')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.reject.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._9'))
        .addStringOption(opt =>
          opt
            .setName('friend')
            .setDescription('Request to reject')
            .setNameLocalizations(buildDiscordLocalizations('friends.cmd.options.friend.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._10'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    // cancel
    .addSubcommand(sub =>
      sub
        .setName('cancel')
        .setDescription('Cancel an outgoing friend request')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.cancel.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._11'))
        .addStringOption(opt =>
          opt
            .setName('friend')
            .setDescription('Request to cancel')
            .setNameLocalizations(buildDiscordLocalizations('friends.cmd.options.friend.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._12'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    // block
    .addSubcommand(sub =>
      sub
        .setName('block')
        .setDescription('Block a user')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.block.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._13'))
        .addStringOption(opt =>
          opt
            .setName('user')
            .setDescription('Display name or account ID')
            .setNameLocalizations(buildDiscordLocalizations('friends.cmd.options.user.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._4'))
            .setRequired(true),
        ),
    )
    // unblock
    .addSubcommand(sub =>
      sub
        .setName('unblock')
        .setDescription('Unblock a user')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.unblock.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._14'))
        .addStringOption(opt =>
          opt
            .setName('user')
            .setDescription('Display name or account ID')
            .setNameLocalizations(buildDiscordLocalizations('friends.cmd.options.user.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._4'))
            .setRequired(true),
        ),
    )
    // accept-all
    .addSubcommand(sub =>
      sub
        .setName('accept-all')
        .setDescription('Accept all incoming friend requests')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.acceptall.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._15')),
    )
    // remove-all
    .addSubcommand(sub =>
      sub
        .setName('remove-all')
        .setDescription('Remove ALL friends from your account')
        .setNameLocalizations(buildDiscordLocalizations('friends.cmd.removeall.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friends.cmd._16')),
    ) as SlashCommandBuilder,

  auth: true,
  cooldown: 5,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(false);

    if (sub === 'remove' || sub === 'eliminar') {
      await handleFriendAutocomplete(interaction);
    } else if (sub === 'accept' || sub === 'aceptar') {
      await handleIncomingAutocomplete(interaction);
    } else if (sub === 'reject' || sub === 'rechazar') {
      await handleIncomingAutocomplete(interaction);
    } else if (sub === 'cancel' || sub === 'cancelar') {
      await handleOutgoingAutocomplete(interaction);
    } else {
      await interaction.respond([]);
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'list':
      case 'lista':
        await handleList(interaction); break;
      case 'summary':
      case 'resumen':
        await handleSummary(interaction); break;
      case 'add':
      case 'agregar':
        await handleAdd(interaction); break;
      case 'remove':
      case 'eliminar':
        await handleRemove(interaction); break;
      case 'accept':
      case 'aceptar':
        await handleAccept(interaction); break;
      case 'reject':
      case 'rechazar':
        await handleReject(interaction); break;
      case 'cancel':
      case 'cancelar':
        await handleCancel(interaction); break;
      case 'block':
      case 'bloquear':
        await handleBlock(interaction); break;
      case 'unblock':
      case 'desbloquear':
        await handleUnblock(interaction); break;
      case 'accept-all':
      case 'aceptar-todos':
        await handleAcceptAll(interaction); break;
      case 'remove-all':
      case 'eliminar-todos':
        await handleRemoveAll(interaction); break;
    }
  },
};

export default command;
