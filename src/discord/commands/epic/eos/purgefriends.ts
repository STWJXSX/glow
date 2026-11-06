/**
 * COMANDO /purgefriends
 * Subcommands: whitelist add, whitelist remove, whitelist list
 *  - whitelist add: Add a friend to your purge whitelist (autocomplete with displayNames)
 *  - whitelist remove: Remove a friend from your purge whitelist (autocomplete with whitelisted)
 *  - whitelist list: Show all whitelisted friends
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import AutoPurgeFriends from '#models/AutoPurgeFriends.ts';
import {
  buildEpicReplyPayload,
  getEpicAuthor,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  translateEpic,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Friend {
  accountId: string;
  displayName: string;
}

async function getFriendsList(accountId: string, accessToken: string): Promise<Friend[]> {
  const friendsRes = await axios.get<Array<{ accountId: string }>>(
    `${Endpoints.FRIENDS}/${accountId}/friends`,
    { headers: { Authorization: `bearer ${accessToken}` }, timeout: 10_000 },
  );

  const ids = friendsRes.data.map(f => f.accountId);
  if (ids.length === 0) return [];

  const friends: Friend[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const qs = batch.map(id => `accountId=${encodeURIComponent(id)}`).join('&');
    const accountsRes = await axios.get<Array<{ id: string; displayName: string }>>(
      `${Endpoints.ACCOUNT_PUBLIC}?${qs}`,
      { headers: { Authorization: `bearer ${accessToken}` }, timeout: 10_000 },
    );
    for (const acc of accountsRes.data) {
      if (acc.displayName) friends.push({ accountId: acc.id, displayName: acc.displayName });
    }
  }

  return friends;
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleWhitelistAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const raw = interaction.options.getString('friend', true);

  const parts = raw.split('|');
  if (parts.length !== 2) {
    await replyEpicCustomError(interaction, discordId, 'purgefriends.errors.invalidSelection');
    return;
  }

  const [displayName, accountId] = parts;

  const userInfo = await UsuarioInfo.findOne({ id: discordId });
  if (!userInfo?.deviceAuths?.length) {
    await replyEpicCredentialError(interaction, discordId, 'noCuenta');
    return;
  }

  const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, discordId, 'noMain');
    return;
  }

  let doc = await AutoPurgeFriends.findOne({ discordId });
  if (!doc) {
    await replyEpicCustomError(interaction, discordId, 'purgefriends.errors.notActive');
    return;
  }

  const accountData = doc.accounts.get(mainAccount.accountId);
  if (!accountData?.isActive) {
    await replyEpicCustomError(interaction, discordId, 'purgefriends.errors.notActiveAccount');
    return;
  }

  if (accountData.whitelist.some(w => w.accountId === accountId)) {
    await replyEpicCustomError(interaction, discordId, 'purgefriends.errors.alreadyWhitelisted', { name: displayName });
    return;
  }

  accountData.whitelist.push({ accountId, displayName });
  doc.markModified('accounts');
  await doc.save();

  const author = await getEpicAuthor(discordId);
  const payload = await buildEpicReplyPayload(discordId, {
    style: 'success',
    title: await translateForUser(discordId, 'purgefriends.add.title', undefined, interaction.locale),
    description: await translateForUser(discordId, 'purgefriends.add.description', {
      name: displayName,
      count: String(accountData.whitelist.length),
    }, interaction.locale),
    author,
    timestamp: true,
  }, interaction);

  await interaction.editReply(payload);
}

async function handleWhitelistRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const raw = interaction.options.getString('friend', true);

  const parts = raw.split('|');
  if (parts.length !== 2) {
    await replyEpicCustomError(interaction, discordId, 'purgefriends.errors.invalidSelection');
    return;
  }

  const [displayName, accountId] = parts;

  const userInfo = await UsuarioInfo.findOne({ id: discordId });
  if (!userInfo?.deviceAuths?.length) {
    await replyEpicCredentialError(interaction, discordId, 'noCuenta');
    return;
  }

  const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, discordId, 'noMain');
    return;
  }

  const doc = await AutoPurgeFriends.findOne({ discordId });
  if (!doc) {
    await replyEpicCustomError(interaction, discordId, 'purgefriends.errors.notActive');
    return;
  }

  const accountData = doc.accounts.get(mainAccount.accountId);
  if (!accountData?.isActive) {
    await replyEpicCustomError(interaction, discordId, 'purgefriends.errors.notActiveAccount');
    return;
  }

  const idx = accountData.whitelist.findIndex(w => w.accountId === accountId);
  if (idx === -1) {
    await replyEpicCustomError(interaction, discordId, 'purgefriends.errors.notWhitelisted', { name: displayName });
    return;
  }

  accountData.whitelist.splice(idx, 1);
  doc.markModified('accounts');
  await doc.save();

  const author = await getEpicAuthor(discordId);
  const payload = await buildEpicReplyPayload(discordId, {
    style: 'warning',
    title: await translateForUser(discordId, 'purgefriends.remove.title', undefined, interaction.locale),
    description: await translateForUser(discordId, 'purgefriends.remove.description', {
      name: displayName,
      count: String(accountData.whitelist.length),
    }, interaction.locale),
    author,
    timestamp: true,
  }, interaction);

  await interaction.editReply(payload);
}

async function handleWhitelistList(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;

  const userInfo = await UsuarioInfo.findOne({ id: discordId });
  if (!userInfo?.deviceAuths?.length) {
    await replyEpicCredentialError(interaction, discordId, 'noCuenta');
    return;
  }

  const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, discordId, 'noMain');
    return;
  }

  const doc = await AutoPurgeFriends.findOne({ discordId });
  const accountData = doc?.accounts.get(mainAccount.accountId);

  if (!accountData?.isActive) {
    await replyEpicCustomError(interaction, discordId, 'purgefriends.errors.notActiveAccount');
    return;
  }

  const author = await getEpicAuthor(discordId);
  const whitelist = accountData.whitelist;

  if (whitelist.length === 0) {
    const payload = await buildEpicReplyPayload(discordId, {
      style: 'info',
      title: await translateForUser(discordId, 'purgefriends.list.empty.title', undefined, interaction.locale),
      description: await translateForUser(discordId, 'purgefriends.list.empty.description', undefined, interaction.locale),
      author,
      timestamp: true,
    }, interaction);

    await interaction.editReply(payload);
    return;
  }

  const list = whitelist.map((w, i) => `**${i + 1}.** ${w.displayName}`).join('\n');

  const payload = await buildEpicReplyPayload(discordId, {
    style: 'info',
    title: await translateForUser(discordId, 'purgefriends.list.title', undefined, interaction.locale),
    description: list,
    footerText: await translateForUser(discordId, 'purgefriends.list.footer', {
      count: String(whitelist.length),
    }, interaction.locale),
    author,
    timestamp: true,
  }, interaction);

  await interaction.editReply(payload);
}

// ---------------------------------------------------------------------------
// Autocomplete handlers
// ---------------------------------------------------------------------------

async function handleAddAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focusedValue = interaction.options.getFocused();
  const discordId = interaction.user.id;

  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (!userInfo?.deviceAuths?.length) {
      await interaction.respond([]);
      return;
    }

    const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
    if (!mainAccount) {
      await interaction.respond([]);
      return;
    }

    const account = mainAccount;

    const friends = await getFriendsList(account.accountId, account.accessToken);
    if (friends.length === 0) {
      await interaction.respond([{ name: await translateForUser(discordId, 'purgefriends.autocomplete.noFriends', undefined, interaction.locale), value: 'none|none' }]);
      return;
    }

    // Filter out already whitelisted friends
    const doc = await AutoPurgeFriends.findOne({ discordId });
    const accountData = doc?.accounts.get(mainAccount.accountId);
    const whitelistIds = new Set(accountData?.whitelist.map(w => w.accountId) ?? []);

    const available = friends.filter(f => !whitelistIds.has(f.accountId));

    const filtered = available.filter(f =>
      f.displayName.toLowerCase().includes(focusedValue.toLowerCase()),
    );

    await interaction.respond(
      filtered.slice(0, 25).map(f => ({
        name: f.displayName,
        value: `${f.displayName}|${f.accountId}`,
      })),
    );
  } catch (err: any) {
    log.commands.error({ error: err.message }, '[PURGEFRIENDS] Autocomplete error (add)');
    await interaction.respond([]);
  }
}

async function handleRemoveAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focusedValue = interaction.options.getFocused();
  const discordId = interaction.user.id;

  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (!userInfo?.deviceAuths?.length) {
      await interaction.respond([]);
      return;
    }

    const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
    if (!mainAccount) {
      await interaction.respond([]);
      return;
    }

    const doc = await AutoPurgeFriends.findOne({ discordId });
    const accountData = doc?.accounts.get(mainAccount.accountId);

    if (!accountData?.whitelist.length) {
      await interaction.respond([{ name: await translateForUser(discordId, 'purgefriends.autocomplete.emptyWhitelist', undefined, interaction.locale), value: 'none|none' }]);
      return;
    }

    const filtered = accountData.whitelist.filter(w =>
      w.displayName.toLowerCase().includes(focusedValue.toLowerCase()),
    );

    await interaction.respond(
      filtered.slice(0, 25).map(w => ({
        name: w.displayName,
        value: `${w.displayName}|${w.accountId}`,
      })),
    );
  } catch (err: any) {
    log.commands.error({ error: err.message }, '[PURGEFRIENDS] Autocomplete error (remove)');
    await interaction.respond([]);
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('purgefriends')
    .setDescription('Manage your AutoPurge Friends whitelist')
    .setNameLocalizations(buildDiscordLocalizations('purgefriends.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('purgefriends.cmd._1'))
    .addSubcommandGroup(group =>
      group
        .setName('whitelist')
        .setDescription('Manage the purge whitelist')
        .setNameLocalizations(buildDiscordLocalizations('purgefriends.cmd.whitelist.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('purgefriends.cmd._2'))
        .addSubcommand(sub =>
          sub
            .setName('add')
            .setDescription('Add a friend to the purge whitelist')
            .setNameLocalizations(buildDiscordLocalizations('purgefriends.cmd.add.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('purgefriends.cmd._3'))
            .addStringOption(opt =>
              opt
                .setName('friend')
                .setDescription('Friend to whitelist')
                .setNameLocalizations(buildDiscordLocalizations('purgefriends.cmd.options.friend.name'))
                .setDescriptionLocalizations(buildDiscordLocalizations('purgefriends.cmd._4'))
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand(sub =>
          sub
            .setName('remove')
            .setDescription('Remove a friend from the purge whitelist')
            .setNameLocalizations(buildDiscordLocalizations('purgefriends.cmd.remove.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('purgefriends.cmd._5'))
            .addStringOption(opt =>
              opt
                .setName('friend')
                .setDescription('Friend to remove from whitelist')
                .setNameLocalizations(buildDiscordLocalizations('purgefriends.cmd.options.friend.name'))
                .setDescriptionLocalizations(buildDiscordLocalizations('purgefriends.cmd._6'))
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand(sub =>
          sub
            .setName('list')
            .setDescription('Show all whitelisted friends')
            .setNameLocalizations(buildDiscordLocalizations('purgefriends.cmd.list.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('purgefriends.cmd._7')),
        ),
    ) as SlashCommandBuilder,

  auth: true,
  automationSystem: 'autopurgefriends',
  nodefer: false,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(false);

    if (sub === 'add' || sub === 'agregar') {
      await handleAddAutocomplete(interaction);
    } else if (sub === 'remove' || sub === 'eliminar') {
      await handleRemoveAutocomplete(interaction);
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(true);

    switch (sub) {
      case 'add':
      case 'agregar':
        await handleWhitelistAdd(interaction);
        break;
      case 'remove':
      case 'eliminar':
        await handleWhitelistRemove(interaction);
        break;
      case 'list':
      case 'lista':
        await handleWhitelistList(interaction);
        break;
    }
  },
};

export default command;
