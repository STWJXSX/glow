/**
 * COMMAND /friendalerts
 * Subcommands: add, remove, list
 *  - add:    Track a friend (autocomplete with your friends). Re-running it updates the toggles.
 *  - remove: Stop tracking a friend (autocomplete with tracked friends).
 *  - list:   Show tracked friends and which alerts are on.
 *
 * The system itself is enabled from /autoconfig; the tracked list starts empty, so nothing is
 * listened to until you add a friend.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import AutoFriendAlerts from '#models/AutoFriendAlerts.ts';
import {
  buildEpicReplyPayload,
  getEpicAuthor,
  replyEpicCredentialError,
  replyEpicCustomError,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { getFriendsWithNames } from '#helpers/epic/friends/friendsList.ts';
import { MAX_WATCHED_FRIENDS } from '#helpers/epic/friends/friendAlertsLimits.ts';
import { callCore } from '#api/glowCore.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveMainAccount(interaction: ChatInputCommandInteraction) {
  const discordId = interaction.user.id;
  const userInfo = await UsuarioInfo.findOne({ id: discordId });
  if (!userInfo?.deviceAuths?.length) {
    await replyEpicCredentialError(interaction, discordId, 'noCuenta');
    return null;
  }
  const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, discordId, 'noMain');
    return null;
  }
  return mainAccount;
}

/** Active config for the main account, or replies with the "not active" error. */
async function loadActiveConfig(interaction: ChatInputCommandInteraction, accountId: string) {
  const discordId = interaction.user.id;
  const doc = await AutoFriendAlerts.findOne({ discordId });
  const config = doc?.accounts.get(accountId);
  if (!doc || !config?.isActive) {
    await replyEpicCustomError(interaction, discordId, 'friendalerts.errors.notActive');
    return null;
  }
  return { doc, config };
}

function parseSelection(raw: string): { displayName: string; accountId: string } | null {
  const idx = raw.lastIndexOf('|');
  if (idx <= 0) return null;
  const displayName = raw.slice(0, idx);
  const accountId = raw.slice(idx + 1);
  if (!accountId || accountId === 'none') return null;
  return { displayName, accountId };
}

async function toggleLabel(discordId: string, locale: string | undefined, on: boolean): Promise<string> {
  return translateForUser(discordId, on ? 'friendalerts.list.on' : 'friendalerts.list.off', undefined, locale);
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const selection = parseSelection(interaction.options.getString('friend', true));
  if (!selection) {
    await replyEpicCustomError(interaction, discordId, 'friendalerts.errors.invalidSelection');
    return;
  }

  const mainAccount = await resolveMainAccount(interaction);
  if (!mainAccount) return;
  const loaded = await loadActiveConfig(interaction, mainAccount.accountId);
  if (!loaded) return;
  const { doc, config } = loaded;

  const notifyOnline = interaction.options.getBoolean('online') ?? true;
  const notifyOffline = interaction.options.getBoolean('offline') ?? true;

  const existing = config.friends.find((f) => f.accountId === selection.accountId);
  if (!existing && config.friends.length >= MAX_WATCHED_FRIENDS) {
    await replyEpicCustomError(interaction, discordId, 'friendalerts.errors.limitReached', {
      max: String(MAX_WATCHED_FRIENDS),
    });
    return;
  }

  if (existing) {
    existing.displayName = selection.displayName;
    existing.notifyOnline = notifyOnline;
    existing.notifyOffline = notifyOffline;
  } else {
    config.friends.push({
      accountId: selection.accountId,
      displayName: selection.displayName,
      notifyOnline,
      notifyOffline,
    });
  }
  config.lastActivity = new Date();
  doc.markModified('accounts');
  await doc.save();

  await callCore('automation.autoFriendAlerts.sync', discordId, mainAccount.accountId);

  const author = await getEpicAuthor(discordId);
  const payload = await buildEpicReplyPayload(discordId, {
    style: 'success',
    title: await translateForUser(discordId, 'friendalerts.add.title', undefined, interaction.locale),
    description: await translateForUser(discordId, 'friendalerts.add.description', {
      name: selection.displayName,
      online: await toggleLabel(discordId, interaction.locale, notifyOnline),
      offline: await toggleLabel(discordId, interaction.locale, notifyOffline),
      count: String(config.friends.length),
      max: String(MAX_WATCHED_FRIENDS),
    }, interaction.locale),
    author,
    timestamp: true,
  }, interaction);

  await interaction.editReply(payload);
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const selection = parseSelection(interaction.options.getString('friend', true));
  if (!selection) {
    await replyEpicCustomError(interaction, discordId, 'friendalerts.errors.invalidSelection');
    return;
  }

  const mainAccount = await resolveMainAccount(interaction);
  if (!mainAccount) return;
  const loaded = await loadActiveConfig(interaction, mainAccount.accountId);
  if (!loaded) return;
  const { doc, config } = loaded;

  const idx = config.friends.findIndex((f) => f.accountId === selection.accountId);
  if (idx === -1) {
    await replyEpicCustomError(interaction, discordId, 'friendalerts.errors.notWatching', {
      name: selection.displayName,
    });
    return;
  }

  config.friends.splice(idx, 1);
  config.lastActivity = new Date();
  doc.markModified('accounts');
  await doc.save();

  // Releases the XMPP connection when this was the last tracked friend.
  await callCore('automation.autoFriendAlerts.sync', discordId, mainAccount.accountId);

  const author = await getEpicAuthor(discordId);
  const payload = await buildEpicReplyPayload(discordId, {
    style: 'warning',
    title: await translateForUser(discordId, 'friendalerts.remove.title', undefined, interaction.locale),
    description: await translateForUser(discordId, 'friendalerts.remove.description', {
      name: selection.displayName,
      count: String(config.friends.length),
    }, interaction.locale),
    author,
    timestamp: true,
  }, interaction);

  await interaction.editReply(payload);
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;

  const mainAccount = await resolveMainAccount(interaction);
  if (!mainAccount) return;
  const loaded = await loadActiveConfig(interaction, mainAccount.accountId);
  if (!loaded) return;
  const { config } = loaded;

  const author = await getEpicAuthor(discordId);

  if (config.friends.length === 0) {
    const payload = await buildEpicReplyPayload(discordId, {
      style: 'info',
      title: await translateForUser(discordId, 'friendalerts.list.empty.title', undefined, interaction.locale),
      description: await translateForUser(discordId, 'friendalerts.list.empty.description', undefined, interaction.locale),
      author,
      timestamp: true,
    }, interaction);
    await interaction.editReply(payload);
    return;
  }

  const onlineLabel = await translateForUser(discordId, 'friendalerts.list.online', undefined, interaction.locale);
  const offlineLabel = await translateForUser(discordId, 'friendalerts.list.offline', undefined, interaction.locale);
  const lines: string[] = [];
  for (const [i, f] of config.friends.entries()) {
    lines.push(
      `**${i + 1}.** ${f.displayName} — ${onlineLabel}: ${await toggleLabel(discordId, interaction.locale, f.notifyOnline)}` +
        ` · ${offlineLabel}: ${await toggleLabel(discordId, interaction.locale, f.notifyOffline)}`,
    );
  }

  const payload = await buildEpicReplyPayload(discordId, {
    style: 'info',
    title: await translateForUser(discordId, 'friendalerts.list.title', undefined, interaction.locale),
    description: lines.join('\n'),
    footerText: await translateForUser(discordId, 'friendalerts.list.footer', {
      count: String(config.friends.length),
      max: String(MAX_WATCHED_FRIENDS),
    }, interaction.locale),
    author,
    timestamp: true,
  }, interaction);

  await interaction.editReply(payload);
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

async function handleAddAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const discordId = interaction.user.id;

  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);
    if (!mainAccount) {
      await interaction.respond([]);
      return;
    }

    const friends = await getFriendsWithNames(mainAccount.accountId, mainAccount.accessToken);
    if (friends.length === 0) {
      await interaction.respond([{
        name: await translateForUser(discordId, 'friendalerts.autocomplete.noFriends', undefined, interaction.locale),
        value: 'none|none',
      }]);
      return;
    }

    const matches = friends
      .filter((f) => f.displayName.toLowerCase().includes(focused))
      .slice(0, 25);

    await interaction.respond(
      matches.map((f) => ({ name: f.displayName.slice(0, 100), value: `${f.displayName}|${f.accountId}`.slice(0, 100) })),
    );
  } catch (err: any) {
    log.commands.error({ error: err.message }, '[FRIENDALERTS] Autocomplete error (add)');
    await interaction.respond([]).catch(() => {});
  }
}

async function handleRemoveAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const discordId = interaction.user.id;

  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);
    if (!mainAccount) {
      await interaction.respond([]);
      return;
    }

    const doc = await AutoFriendAlerts.findOne({ discordId });
    const friends = doc?.accounts.get(mainAccount.accountId)?.friends ?? [];
    if (friends.length === 0) {
      await interaction.respond([{
        name: await translateForUser(discordId, 'friendalerts.autocomplete.emptyList', undefined, interaction.locale),
        value: 'none|none',
      }]);
      return;
    }

    await interaction.respond(
      friends
        .filter((f) => f.displayName.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((f) => ({ name: f.displayName.slice(0, 100), value: `${f.displayName}|${f.accountId}`.slice(0, 100) })),
    );
  } catch (err: any) {
    log.commands.error({ error: err.message }, '[FRIENDALERTS] Autocomplete error (remove)');
    await interaction.respond([]).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('friendalerts')
    .setDescription('Get a DM when selected friends come online or go offline')
    .setNameLocalizations(buildDiscordLocalizations('friendalerts.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('friendalerts.cmd._1'))
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Track a friend (or update its alerts)')
        .setNameLocalizations(buildDiscordLocalizations('friendalerts.cmd.add.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friendalerts.cmd._2'))
        .addStringOption(opt =>
          opt
            .setName('friend')
            .setDescription('Friend to track')
            .setNameLocalizations(buildDiscordLocalizations('friendalerts.cmd.options.friend.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friendalerts.cmd._3'))
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addBooleanOption(opt =>
          opt
            .setName('online')
            .setDescription('Alert when they come online (default: yes)')
            .setNameLocalizations(buildDiscordLocalizations('friendalerts.cmd.options.online.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friendalerts.cmd._4')),
        )
        .addBooleanOption(opt =>
          opt
            .setName('offline')
            .setDescription('Alert when they go offline (default: yes)')
            .setNameLocalizations(buildDiscordLocalizations('friendalerts.cmd.options.offline.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friendalerts.cmd._5')),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Stop tracking a friend')
        .setNameLocalizations(buildDiscordLocalizations('friendalerts.cmd.remove.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friendalerts.cmd._6'))
        .addStringOption(opt =>
          opt
            .setName('friend')
            .setDescription('Friend to stop tracking')
            .setNameLocalizations(buildDiscordLocalizations('friendalerts.cmd.options.friend.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('friendalerts.cmd._7'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Show tracked friends and their alerts')
        .setNameLocalizations(buildDiscordLocalizations('friendalerts.cmd.list.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friendalerts.cmd._8')),
    ) as SlashCommandBuilder,

  auth: true,
  automationSystem: 'autofriendalerts',
  nodefer: false,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(false);
    if (sub === 'add' || sub === 'agregar') await handleAddAutocomplete(interaction);
    else if (sub === 'remove' || sub === 'eliminar') await handleRemoveAutocomplete(interaction);
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    switch (interaction.options.getSubcommand(true)) {
      case 'add':
      case 'agregar':
        await handleAdd(interaction);
        break;
      case 'remove':
      case 'eliminar':
        await handleRemove(interaction);
        break;
      case 'list':
      case 'lista':
        await handleList(interaction);
        break;
    }
  },
};

export default command;
