/**
 * COMANDO /autoloadout
 * Subcommands: add, remove, list
 *  - add:    Assign a hero loadout to a mission type (autocomplete for both)
 *  - remove: Remove a loadout assignment for a mission type
 *  - list:   Show all configured loadout assignments
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { buildDiscordLocalizations, translateForUser, getUserLanguage } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { translateHeroName } from '#helpers/locales/gameTranslations.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import AutoLoadout from '#models/AutoLoadout.ts';
import {
  buildEpicEmbed,
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  getEpicAuthor,
  epicSection,
  epicQuote,
  epicEmojiLine,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

const MISSION_TYPES = [
  'Ride the Lightning',
  'Retrieve the Data',
  'Deliver the Bomb',
  'Fight the Storm',
  'Fight Category 2 Storm',
  'Fight Category 3 Storm',
  'Fight Category 4 Storm',
  'Destroy the Encampments',
  'Build the Radar Grid',
  'Resupply',
  'Eliminate and Collect',
  'Repair the Shelter',
  'Evacuate the Shelter',
  'Rescue the Survivors',
  'Refuel the Homebase',
  'Launch the Rocket',
  'Hunt the Titan',
  'Storm Shield Defense',
  'Stabilize the Rift',
  'Hit the Road',
  'Fight the Gunslinger',
];

interface LoadoutInfo {
  guid: string;
  index: number;
  commanderTemplateId: string;
  commanderDisplayName: string;
}

async function fetchLoadouts(accountId: string, accessToken: string, lang: SupportedLanguage = 'en'): Promise<LoadoutInfo[]> {
  const result = await composeMCP({
    profile: 'campaign',
    operation: 'QueryProfile',
    accountId,
    accessToken,
    body: {},
  });

  const items = result.data?.profileChanges?.[0]?.profile?.items;
  if (!items) return [];

  const loadouts: LoadoutInfo[] = [];
  let index = 1;

  for (const [guid, item] of Object.entries<any>(items)) {
    if (!item.templateId?.startsWith('CampaignHeroLoadout:')) continue;

    const commanderSlot = item.attributes?.crew_members?.commanderslot;
    let commanderTemplateId = '';
    let commanderDisplayName = '';

    if (commanderSlot && items[commanderSlot]) {
      commanderTemplateId = items[commanderSlot].templateId || '';
      const translated = translateHeroName(commanderTemplateId, lang);
      if (translated !== commanderTemplateId) {
        commanderDisplayName = translated;
      } else {
        const parts = commanderTemplateId.replace('Hero:', '').split('_');
        commanderDisplayName = parts.join(' ');
      }
    }

    loadouts.push({
      guid,
      index,
      commanderTemplateId,
      commanderDisplayName: commanderDisplayName || `Loadout ${index}`,
    });
    index++;
  }

  return loadouts;
}

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;

  const missionType = interaction.options.getString('mission', true);
  const loadoutGUID = interaction.options.getString('loadout', true);

  if (!MISSION_TYPES.includes(missionType)) {
    await replyEpicCustomError(interaction, discordId, 'autoloadout.errors.invalidMission');
    return;
  }

  if (!loadoutGUID || loadoutGUID === 'none') {
    await replyEpicCustomError(interaction, discordId, 'autoloadout.errors.invalidLoadout');
    return;
  }

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

  const accountId = mainAccount.accountId;

  const { account } = await refreshAccountToken(userInfo, accountId);
  if (!account) {
    await replyEpicCredentialError(interaction, discordId, 'noCuenta');
    return;
  }

  const userLang = await getUserLanguage(discordId, locale);
  const loadouts = await fetchLoadouts(account.accountId, account.accessToken, userLang);
  const selectedLoadout = loadouts.find(l => l.guid === loadoutGUID);
  if (!selectedLoadout) {
    await replyEpicCustomError(interaction, discordId, 'autoloadout.errors.invalidLoadout');
    return;
  }

  const { index: loadoutIndex, commanderTemplateId, commanderDisplayName } = selectedLoadout;

  let doc = await AutoLoadout.findOne({ discordId });
  if (!doc) {
    doc = new AutoLoadout({ discordId, accounts: new Map() });
  }

  let accountData = doc.accounts.get(accountId);
  if (!accountData) {
    accountData = {
      isActive: true,
      accountId,
      loadouts: new Map(),
      createdAt: new Date(),
      lastActivity: new Date(),
    } as any;
    doc.accounts.set(accountId, accountData!);
  }

  const existing = accountData!.loadouts.get(missionType);
  const isOverwrite = !!existing;

  accountData!.loadouts.set(missionType, {
    loadoutGUID,
    loadoutIndex,
    commanderTemplateId,
    commanderDisplayName,
    missionType,
  });

  doc.markModified('accounts');
  await doc.save();

  const authorData = await getEpicAuthor(discordId, {
    accountId: account.accountId,
    accessToken: account.accessToken,
    displayName: mainAccount.displayName,
  });

  const action = isOverwrite
    ? await translateForUser(discordId, 'autoloadout.add.overwritten', undefined, locale)
    : await translateForUser(discordId, 'autoloadout.add.added', undefined, locale);
  const missionLabel = await translateForUser(discordId, 'autoloadout.add.missionLabel', undefined, locale);
  const loadoutLabel = await translateForUser(discordId, 'autoloadout.add.loadoutLabel', undefined, locale);
  const totalLine = await translateForUser(
    discordId,
    'autoloadout.add.total',
    { count: String(accountData!.loadouts.size) },
    locale,
  );

  const description = [
    epicEmojiLine(client, 'success', action),
    '',
    epicSection(missionLabel),
    epicQuote(missionType),
    epicSection(loadoutLabel),
    epicQuote(`#${loadoutIndex} — ${commanderDisplayName}`),
    '',
    epicQuote(totalLine),
  ].join('\n');

  await replyWithEpicEmbed(interaction, discordId, {
    style: 'success',
    title: 'AutoLoadout',
    description,
    author: authorData,
    timestamp: true,
    footerKey: 'brand',
  });
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;

  const missionType = interaction.options.getString('mission', true);

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

  const doc = await AutoLoadout.findOne({ discordId });
  const accountData = doc?.accounts?.get(mainAccount.accountId);

  if (!accountData || !accountData.loadouts.has(missionType)) {
    await replyEpicCustomError(interaction, discordId, 'autoloadout.errors.notConfigured', { mission: missionType });
    return;
  }

  accountData.loadouts.delete(missionType);
  doc!.markModified('accounts');
  await doc!.save();

  const authorData = await getEpicAuthor(discordId);

  const removedLine = await translateForUser(
    discordId,
    'autoloadout.remove.removed',
    { mission: missionType },
    locale,
  );
  const totalLine = await translateForUser(
    discordId,
    'autoloadout.add.total',
    { count: String(accountData.loadouts.size) },
    locale,
  );

  const description = [
    epicEmojiLine(client, 'success', removedLine),
    '',
    epicQuote(totalLine),
  ].join('\n');

  await replyWithEpicEmbed(interaction, discordId, {
    style: 'success',
    title: 'AutoLoadout',
    description,
    author: authorData,
    timestamp: true,
    footerKey: 'brand',
  });
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;

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

  const doc = await AutoLoadout.findOne({ discordId });
  const accountData = doc?.accounts?.get(mainAccount.accountId);

  const authorData = await getEpicAuthor(discordId);

  const header = await translateForUser(discordId, 'autoloadout.list.header', undefined, locale);
  const lines: string[] = [epicSection(header)];

  if (!accountData || accountData.loadouts.size === 0) {
    lines.push('', await translateForUser(discordId, 'autoloadout.list.empty', undefined, locale));
    await replyWithEpicEmbed(interaction, discordId, {
      style: 'info',
      title: 'AutoLoadout',
      description: lines.join('\n'),
      author: authorData,
      timestamp: true,
      footerKey: 'brand',
    });
    return;
  }

  lines.push('');
  for (const [mType, cfg] of accountData.loadouts.entries()) {
    lines.push(
      epicEmojiLine(client, 'active', `**${mType}**`),
      epicQuote(`#${cfg.loadoutIndex} — ${cfg.commanderDisplayName}`),
      '',
    );
  }

  const lastRun = accountData.lastActivity
    ? `<t:${Math.floor(new Date(accountData.lastActivity).getTime() / 1000)}:R>`
    : '—';
  const lastActivityLabel = await translateForUser(discordId, 'autoloadout.list.lastActivity', undefined, locale);
  const totalConfigsLabel = await translateForUser(discordId, 'autoloadout.list.totalConfigs', undefined, locale);
  const footer = await translateForUser(discordId, 'autoloadout.list.footer', undefined, locale);
  lines.push(
    epicQuote(`${lastActivityLabel}: ${lastRun} | ${totalConfigsLabel}: **${accountData.loadouts.size}**`),
    epicQuote(footer),
  );

  await replyWithEpicEmbed(interaction, discordId, {
    style: 'info',
    title: 'AutoLoadout',
    description: lines.join('\n'),
    author: authorData,
    timestamp: true,
    footerKey: 'brand',
  });
}

async function handleMissionAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const filtered = MISSION_TYPES.filter(m => m.toLowerCase().includes(focused));
  await interaction.respond(
    filtered.slice(0, 25).map(m => ({ name: m, value: m })),
  );
}

async function handleLoadoutAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const discordId = interaction.user.id;
  const locale = interaction.locale;

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

    const { account } = await refreshAccountToken(userInfo, mainAccount.accountId);
    if (!account) {
      await interaction.respond([]);
      return;
    }

    const lang = await getUserLanguage(discordId, locale);
    let loadouts: LoadoutInfo[];
    try {
      loadouts = await fetchLoadouts(account.accountId, account.accessToken, lang);
    } catch (fetchErr: any) {
      if (fetchErr?.response?.status === 401) {
        const freshUser = await UsuarioInfo.findOne({ id: discordId });
        if (!freshUser) { await interaction.respond([]); return; }
        const { account: retryAccount } = await refreshAccountToken(freshUser, mainAccount.accountId);
        if (!retryAccount) { await interaction.respond([]); return; }
        loadouts = await fetchLoadouts(retryAccount.accountId, retryAccount.accessToken, lang);
      } else {
        throw fetchErr;
      }
    }
    if (loadouts.length === 0) {
      await interaction.respond([{
        name: await translateForUser(discordId, 'autoloadout.autocomplete.noLoadouts', undefined, locale),
        value: 'none',
      }]);
      return;
    }

    const filtered = loadouts.filter(l =>
      `#${l.index} ${l.commanderDisplayName}`.toLowerCase().includes(focused),
    );

    await interaction.respond(
      filtered.slice(0, 25).map(l => ({
        name: `#${l.index} — ${l.commanderDisplayName}`.slice(0, 100),
        value: l.guid,
      })),
    );
  } catch (err: any) {
    log.commands.error({ error: err.message }, '[AUTOLOADOUT] Autocomplete error (loadout)');
    await interaction.respond([]);
  }
}

async function handleRemoveAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const discordId = interaction.user.id;
  const locale = interaction.locale;

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

    const doc = await AutoLoadout.findOne({ discordId });
    const accountData = doc?.accounts?.get(mainAccount.accountId);

    if (!accountData || accountData.loadouts.size === 0) {
      await interaction.respond([{
        name: await translateForUser(discordId, 'autoloadout.autocomplete.noConfigs', undefined, locale),
        value: 'none',
      }]);
      return;
    }

    const configs: { name: string; value: string }[] = [];
    for (const [mType, cfg] of accountData.loadouts.entries()) {
      configs.push({
        name: `${mType} — #${cfg.loadoutIndex} ${cfg.commanderDisplayName}`.slice(0, 100),
        value: mType,
      });
    }

    const filtered = configs.filter(c => c.name.toLowerCase().includes(focused));
    await interaction.respond(filtered.slice(0, 25));
  } catch (err: any) {
    log.commands.error({ error: err.message }, '[AUTOLOADOUT] Autocomplete error (remove)');
    await interaction.respond([]);
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('autoloadout')
    .setDescription('Configure automatic hero loadout per mission type')
    .setNameLocalizations(buildDiscordLocalizations('autoloadout.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('autoloadout.cmd._1'))
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Assign a loadout to a mission type')
        .setNameLocalizations(buildDiscordLocalizations('autoloadout.cmd.add.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('autoloadout.cmd._2'))
        .addStringOption(opt =>
          opt
            .setName('mission')
            .setDescription('Mission type')
            .setNameLocalizations(buildDiscordLocalizations('autoloadout.cmd.options.mission.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('autoloadout.cmd._3'))
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption(opt =>
          opt
            .setName('loadout')
            .setDescription('Hero loadout to use')
            .setNameLocalizations(buildDiscordLocalizations('autoloadout.cmd.options.loadout.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('autoloadout.cmd._4'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a loadout assignment')
        .setNameLocalizations(buildDiscordLocalizations('autoloadout.cmd.remove.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('autoloadout.cmd._5'))
        .addStringOption(opt =>
          opt
            .setName('mission')
            .setDescription('Mission type to remove')
            .setNameLocalizations(buildDiscordLocalizations('autoloadout.cmd.options.mission.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('autoloadout.cmd._6'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Show all configured loadout assignments')
        .setNameLocalizations(buildDiscordLocalizations('autoloadout.cmd.list.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('autoloadout.cmd._7')),
    ) as unknown as SlashCommandBuilder,

  auth: true,
  automationSystem: 'autoloadout',
  nodefer: false,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(false);
    const focused = interaction.options.getFocused(true);

    if (sub === 'add' || sub === 'añadir') {
      if (focused.name === 'mission' || focused.name === 'mision') {
        await handleMissionAutocomplete(interaction);
      } else if (focused.name === 'loadout') {
        await handleLoadoutAutocomplete(interaction);
      }
    } else if (sub === 'remove' || sub === 'quitar') {
      await handleRemoveAutocomplete(interaction);
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(true);

    switch (sub) {
      case 'add':
      case 'añadir':
        await handleAdd(interaction);
        break;
      case 'remove':
      case 'quitar':
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
