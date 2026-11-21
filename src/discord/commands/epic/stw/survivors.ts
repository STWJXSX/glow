/**
 * COMANDO /survivors
 * Subcommands: save, config, delete, list, image
 *  - save:   Save the current survivor squad layout from the campaign profile
 *  - config: Map a saved preset to a mission type for automatic switching
 *  - delete: Remove a saved preset or mission mapping
 *  - list:   Show all saved presets and mission mappings
 *  - image:  Grid image(s) of all campaign survivors
 *
 * AutoSurvivors (save/config/delete/list): premMonthly, epic embeds, i18n.
 * Image: auth only (no monthly premium).
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  AttachmentBuilder,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { buildDiscordLocalizations, getUserLanguage, translateForUser, toLegacyLanguage } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { checkCommandPremiumRequirements } from '#helpers/core/client/premium.ts';
import {
  fetchCampaignSurvivors,
  type CampaignSurvivorItem,
} from '#helpers/epic/stw/collection/stwCampaignSurvivors.ts';
import {
  buildSurvivorFilterHint,
  filterCampaignSurvivorsMulti,
  labelForSurvivorTypeMenuValue,
  SURVIVOR_TYPE_FILTER_CHOICES,
  type SurvivorTypeFilterOption,
  type SurvivorTypeMenuValue,
} from '#helpers/epic/stw/inventory/stwSurvivorFilters.ts';
import { generateStwCardsPanelResult } from '#managers/images/stw/index.ts';
import {
  runCollectionImagePanel,
  runCollectionImageBulk,
  type CollectionImagePanelConfig,
} from '#helpers/epic/stw/collection/stwCollectionImagePanel.ts';
import { guardBulkMode, addBulkOption } from '#helpers/core/client/bulkAccess.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import AutoSurvivors, { type ISurvivorSlot } from '#models/AutoSurvivors.ts';
import { callCore } from '#api/glowCore.ts';
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

// ── Mission types (mirrors autoloadout) ──────────────────────

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

// ── Squad display names ──────────────────────────────────────

const SQUAD_DISPLAY: Record<string, { en: string; es: string }> = {
  'squad_attribute_medicine_emtsquad': { en: 'EMT Squad', es: 'Escuadrón Médico' },
  'squad_attribute_arms_fireteamalpha': { en: 'Fire Team Alpha', es: 'Equipo de Fuego Alfa' },
  'squad_attribute_scavenging_gadgeteers': { en: 'Gadgeteers', es: 'Inventores' },
  'squad_attribute_synthesis_corpsofengineering': { en: 'Corps of Engineering', es: 'Cuerpo de Ingeniería' },
  'squad_attribute_medicine_trainingteam': { en: 'Training Team', es: 'Equipo de Entrenamiento' },
  'squad_attribute_arms_closeassaultsquad': { en: 'Close Assault Squad', es: 'Escuadrón de Asalto' },
  'squad_attribute_scavenging_scoutingparty': { en: 'Scouting Party', es: 'Grupo de Exploración' },
  'squad_attribute_synthesis_thethinktank': { en: 'The Think Tank', es: 'Grupo de Estrategia' },
};

const MAX_PRESETS = 10;

// ── Helpers ──────────────────────────────────────────────────

function safeMapEntries<T>(map: Map<string, T> | Record<string, T> | undefined): [string, T][] {
  if (!map) return [];
  if (map instanceof Map) return [...map.entries()];
  if (typeof map === 'object') return Object.entries(map);
  return [];
}

function safeMapGet<T>(map: Map<string, T> | Record<string, T> | undefined, key: string): T | undefined {
  if (!map) return undefined;
  if (map instanceof Map) return map.get(key);
  if (typeof map === 'object') return (map as Record<string, T>)[key];
  return undefined;
}

function safeMapHas(map: Map<string, any> | Record<string, any> | undefined, key: string): boolean {
  if (!map) return false;
  if (map instanceof Map) return map.has(key);
  if (typeof map === 'object') return key in map;
  return false;
}

function safeMapSize(map: Map<string, any> | Record<string, any> | undefined): number {
  if (!map) return 0;
  if (map instanceof Map) return map.size;
  if (typeof map === 'object') return Object.keys(map).length;
  return 0;
}

async function ensureMonthlyPremium(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const result = await checkCommandPremiumRequirements(
    command,
    interaction.user.id,
    interaction.guildId,
    interaction.client,
  );
  if (result.allowed) return true;

  await replyEpicCustomError(
    interaction,
    interaction.user.id,
    `errors.${result.reason || 'monthly_premium_required'}`,
  );
  return false;
}

async function fetchSurvivorSquads(accountId: string, accessToken: string): Promise<ISurvivorSlot[]> {
  const result = await composeMCP({
    profile: 'campaign',
    operation: 'QueryProfile',
    accountId,
    accessToken,
    body: {},
  });

  const items = result.data?.profileChanges?.[0]?.profile?.items;
  if (!items) return [];

  const workers: ISurvivorSlot[] = [];

  for (const [itemId, item] of Object.entries<any>(items)) {
    if (!item.templateId?.startsWith('Worker:')) continue;

    const squadId = item.attributes?.squad_id;
    const slotIndex = item.attributes?.squad_slot_idx;

    if (!squadId || squadId === '' || slotIndex == null || slotIndex < 0) continue;

    workers.push({
      itemId,
      templateId: item.templateId,
      squadId,
      slotIndex,
    });
  }

  return workers;
}

// ── Subcommand handlers ──────────────────────────────────────

async function handleSave(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const lang: SupportedLanguage = await getUserLanguage(discordId, locale) as SupportedLanguage;

  if (!(await ensureMonthlyPremium(interaction))) return;

  const presetName = interaction.options.getString('name', true).trim();

  if (!presetName || presetName.length > 32) {
    await replyEpicCustomError(interaction, discordId, 'survivors.errors.invalidName');
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

  const workers = await fetchSurvivorSquads(account.accountId, account.accessToken);

  if (workers.length === 0) {
    await replyEpicCustomError(interaction, discordId, 'survivors.errors.noSurvivors');
    return;
  }

  let doc = await AutoSurvivors.findOne({ discordId });
  if (!doc) {
    doc = new AutoSurvivors({ discordId, accounts: new Map() });
  }

  let accountData = doc.accounts.get(accountId);
  if (!accountData) {
    accountData = {
      isActive: false,
      accountId,
      presets: new Map(),
      missionMappings: new Map(),
      createdAt: new Date(),
      lastActivity: new Date(),
    } as any;
    doc.accounts.set(accountId, accountData!);
  }

  const isOverwrite = safeMapHas(accountData!.presets, presetName);
  if (!isOverwrite && safeMapSize(accountData!.presets) >= MAX_PRESETS) {
    await replyEpicCustomError(interaction, discordId, 'survivors.errors.maxPresets', { max: String(MAX_PRESETS) });
    return;
  }

  accountData!.presets.set(presetName, {
    name: presetName,
    workers,
    savedAt: new Date(),
  });

  doc.markModified('accounts');
  await doc.save();

  const squadCounts = new Map<string, number>();
  for (const w of workers) {
    squadCounts.set(w.squadId, (squadCounts.get(w.squadId) || 0) + 1);
  }

  const squadLines: string[] = [];
  for (const [squadId, count] of squadCounts.entries()) {
    const displayName = SQUAD_DISPLAY[squadId]?.[toLegacyLanguage(lang)] || squadId;
    squadLines.push(epicQuote(`${displayName}: **${count}**`));
  }

  const authorData = await getEpicAuthor(discordId, {
    accountId: account.accountId,
    accessToken: account.accessToken,
    displayName: mainAccount.displayName,
  });

  const action = isOverwrite
    ? await translateForUser(discordId, 'survivors.save.overwritten', undefined, locale)
    : await translateForUser(discordId, 'survivors.save.saved', undefined, locale);
  const presetLabel = await translateForUser(discordId, 'survivors.save.presetLabel', undefined, locale);
  const workersLabel = await translateForUser(discordId, 'survivors.save.workersLabel', undefined, locale);
  const totalLine = await translateForUser(
    discordId,
    'survivors.save.total',
    { count: String(safeMapSize(accountData!.presets)) },
    locale,
  );
  const header = await translateForUser(discordId, 'survivors.save.header', undefined, locale);

  const description = [
    epicEmojiLine(client, 'success', action),
    '',
    epicSection(header),
    epicSection(presetLabel),
    epicQuote(presetName),
    epicSection(workersLabel),
    epicQuote(String(workers.length)),
    '',
    ...squadLines,
    '',
    epicQuote(totalLine),
  ].join('\n');

  await replyWithEpicEmbed(interaction, discordId, {
    style: 'success',
    title: 'AutoSurvivors',
    description,
    author: authorData,
    timestamp: true,
    footerKey: 'brand',
  });
}

async function handleConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;

  if (!(await ensureMonthlyPremium(interaction))) return;

  const missionType = interaction.options.getString('mission', true);
  const presetName = interaction.options.getString('preset', true);

  if (!MISSION_TYPES.includes(missionType)) {
    await replyEpicCustomError(interaction, discordId, 'survivors.errors.invalidMission');
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

  const doc = await AutoSurvivors.findOne({ discordId });
  const accountData = doc?.accounts?.get(accountId);

  if (!accountData) {
    await replyEpicCustomError(interaction, discordId, 'survivors.errors.noPresets');
    return;
  }

  if (!safeMapHas(accountData.presets, presetName)) {
    await replyEpicCustomError(interaction, discordId, 'survivors.errors.presetNotFound', { name: presetName });
    return;
  }

  const existing = safeMapGet(accountData.missionMappings, missionType);
  const isOverwrite = !!existing;

  accountData.missionMappings.set(missionType, presetName);

  if (!accountData.isActive) {
    accountData.isActive = true;
    const freshUser = await UsuarioInfo.findOne({ id: discordId });
    if (freshUser) {
      await callCore('automation.autoSurvivors.activate', discordId, accountId);
    }
  }

  doc!.markModified('accounts');
  await doc!.save();

  const authorData = await getEpicAuthor(discordId);

  const action = isOverwrite
    ? await translateForUser(discordId, 'survivors.config.overwritten', undefined, locale)
    : await translateForUser(discordId, 'survivors.config.saved', undefined, locale);
  const missionLabel = await translateForUser(discordId, 'survivors.config.missionLabel', undefined, locale);
  const presetLabel = await translateForUser(discordId, 'survivors.config.presetLabel', undefined, locale);
  const totalLine = await translateForUser(
    discordId,
    'survivors.config.total',
    { count: String(safeMapSize(accountData.missionMappings)) },
    locale,
  );
  const header = await translateForUser(discordId, 'survivors.config.header', undefined, locale);

  const description = [
    epicEmojiLine(client, 'success', action),
    '',
    epicSection(header),
    epicSection(missionLabel),
    epicQuote(missionType),
    epicSection(presetLabel),
    epicQuote(presetName),
    '',
    epicQuote(totalLine),
  ].join('\n');

  await replyWithEpicEmbed(interaction, discordId, {
    style: 'success',
    title: 'AutoSurvivors',
    description,
    author: authorData,
    timestamp: true,
    footerKey: 'brand',
  });
}

async function handleDelete(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;

  if (!(await ensureMonthlyPremium(interaction))) return;

  const target = interaction.options.getString('target', true);

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

  const doc = await AutoSurvivors.findOne({ discordId });
  const accountData = doc?.accounts?.get(mainAccount.accountId);

  if (!accountData) {
    await replyEpicCustomError(interaction, discordId, 'survivors.errors.noPresets');
    return;
  }

  let deletedType: 'preset' | 'mapping';
  let deletedName: string;

  if (target.startsWith('preset:')) {
    const presetName = target.slice(7);
    if (!safeMapHas(accountData.presets, presetName)) {
      await replyEpicCustomError(interaction, discordId, 'survivors.errors.presetNotFound', { name: presetName });
      return;
    }

    for (const [mission, mappedPreset] of safeMapEntries(accountData.missionMappings)) {
      if (mappedPreset === presetName) {
        accountData.missionMappings.delete(mission);
      }
    }

    accountData.presets.delete(presetName);
    deletedType = 'preset';
    deletedName = presetName;
  } else if (target.startsWith('mapping:')) {
    const missionType = target.slice(8);
    if (!safeMapHas(accountData.missionMappings, missionType)) {
      await replyEpicCustomError(interaction, discordId, 'survivors.errors.mappingNotFound', { mission: missionType });
      return;
    }

    accountData.missionMappings.delete(missionType);
    deletedType = 'mapping';
    deletedName = missionType;
  } else {
    await replyEpicCustomError(interaction, discordId, 'survivors.errors.invalidTarget');
    return;
  }

  if (safeMapSize(accountData.missionMappings) === 0 && accountData.isActive) {
    accountData.isActive = false;
    await callCore('automation.autoSurvivors.deactivate', discordId, mainAccount.accountId);
  }

  doc!.markModified('accounts');
  await doc!.save();

  const authorData = await getEpicAuthor(discordId);

  const msg = deletedType === 'preset'
    ? await translateForUser(discordId, 'survivors.delete.presetDeleted', { name: deletedName }, locale)
    : await translateForUser(discordId, 'survivors.delete.mappingDeleted', { mission: deletedName }, locale);
  const totalPresets = await translateForUser(
    discordId,
    'survivors.save.total',
    { count: String(safeMapSize(accountData.presets)) },
    locale,
  );
  const totalMappings = await translateForUser(
    discordId,
    'survivors.config.total',
    { count: String(safeMapSize(accountData.missionMappings)) },
    locale,
  );
  const header = await translateForUser(discordId, 'survivors.delete.header', undefined, locale);

  const description = [
    epicEmojiLine(client, 'success', msg),
    '',
    epicSection(header),
    epicQuote(`${totalPresets} | ${totalMappings}`),
  ].join('\n');

  await replyWithEpicEmbed(interaction, discordId, {
    style: 'success',
    title: 'AutoSurvivors',
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

  if (!(await ensureMonthlyPremium(interaction))) return;

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

  const doc = await AutoSurvivors.findOne({ discordId });
  const accountData = doc?.accounts?.get(mainAccount.accountId);

  const authorData = await getEpicAuthor(discordId);
  const header = await translateForUser(discordId, 'survivors.list.header', undefined, locale);
  const lines: string[] = [epicSection(header)];

  if (!accountData || (safeMapSize(accountData.presets) === 0 && safeMapSize(accountData.missionMappings) === 0)) {
    lines.push('', await translateForUser(discordId, 'survivors.list.empty', undefined, locale));
    await replyWithEpicEmbed(interaction, discordId, {
      style: 'info',
      title: 'AutoSurvivors',
      description: lines.join('\n'),
      author: authorData,
      timestamp: true,
      footerKey: 'brand',
    });
    return;
  }

  if (safeMapSize(accountData.presets) > 0) {
    const presetsTitle = await translateForUser(discordId, 'survivors.list.presetsTitle', undefined, locale);
    const workersWord = await translateForUser(discordId, 'survivors.list.workers', undefined, locale);
    lines.push('', epicSection(presetsTitle));
    for (const [name, preset] of safeMapEntries(accountData.presets)) {
      const savedTime = `<t:${Math.floor(new Date(preset.savedAt).getTime() / 1000)}:R>`;
      lines.push(
        epicEmojiLine(client, 'active', `**${name}**`),
        epicQuote(`${preset.workers.length} ${workersWord} (${savedTime})`),
        '',
      );
    }
  }

  if (safeMapSize(accountData.missionMappings) > 0) {
    const mappingsTitle = await translateForUser(discordId, 'survivors.list.mappingsTitle', undefined, locale);
    lines.push(epicSection(mappingsTitle));
    for (const [missionType, presetName] of safeMapEntries(accountData.missionMappings)) {
      lines.push(
        epicEmojiLine(client, 'active', `**${missionType}**`),
        epicQuote(`→ ${presetName}`),
        '',
      );
    }
  }

  const lastRun = accountData.lastActivity
    ? `<t:${Math.floor(new Date(accountData.lastActivity).getTime() / 1000)}:R>`
    : '—';
  const lastActivityLabel = await translateForUser(discordId, 'survivors.list.lastActivity', undefined, locale);
  const totalPresets = await translateForUser(
    discordId,
    'survivors.save.total',
    { count: String(safeMapSize(accountData.presets)) },
    locale,
  );
  const totalMappings = await translateForUser(
    discordId,
    'survivors.config.total',
    { count: String(safeMapSize(accountData.missionMappings)) },
    locale,
  );
  const footer = await translateForUser(discordId, 'survivors.list.footer', undefined, locale);

  lines.push(
    epicQuote(`${lastActivityLabel}: ${lastRun} | ${totalPresets} | ${totalMappings}`),
    epicQuote(footer),
  );

  await replyWithEpicEmbed(interaction, discordId, {
    style: 'info',
    title: 'AutoSurvivors',
    description: lines.join('\n'),
    author: authorData,
    timestamp: true,
    footerKey: 'brand',
  });
}

const SURVIVORS_PANEL_CONFIG: CollectionImagePanelConfig<CampaignSurvivorItem, SurvivorTypeFilterOption> = {
  customIdPrefix: 'stw_sur',
  labels: {
    titleKey: 'stwCollection.survivors.title',
    itemKey: 'stwCollection.survivors.item',
    typePlaceholderKey: 'stwCollection.survivors.typePlaceholder',
    emptyKey: 'stwCollection.survivors.empty',
    noMatchKey: 'stwCollection.survivors.noMatch',
    loadingKey: 'stwCollection.survivors.loading',
    errorKey: 'stwCollection.survivors.error',
  },
  sortHintKey: 'stwCollection.panel.sortHint',
  typeChoices: SURVIVOR_TYPE_FILTER_CHOICES,
  labelTypeValue: labelForSurvivorTypeMenuValue,
  filterItems: (items, state) =>
    filterCampaignSurvivorsMulti(items, {
      types: state.types as SurvivorTypeMenuValue[],
      rarities: state.rarities,
    }),
  buildFilterHint: (lang, state) =>
    buildSurvivorFilterHint(lang, {
      types: state.types as SurvivorTypeMenuValue[],
      rarities: state.rarities,
    }),
  generate: ({ items, header, account, profileBody, discordUserId, userLanguage }) =>
    generateStwCardsPanelResult('survivors', { items, header, account, profileBody, discordUserId, lang: userLanguage }),
};

async function handleImageSurvivorsBulk(interaction: ChatInputCommandInteraction): Promise<void> {
  await runCollectionImageBulk(
    interaction,
    SURVIVORS_PANEL_CONFIG,
    fetchCampaignSurvivors,
    '[SURVIVORS] bulk image error',
  );
}

async function handleImageSurvivors(interaction: ChatInputCommandInteraction): Promise<void> {
  await runCollectionImagePanel(
    interaction,
    SURVIVORS_PANEL_CONFIG,
    fetchCampaignSurvivors,
    '[SURVIVORS] image error',
  );
}

// ── Autocomplete handlers ────────────────────────────────────

async function handleMissionAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const filtered = MISSION_TYPES.filter(m => m.toLowerCase().includes(focused));
  await interaction.respond(
    filtered.slice(0, 25).map(m => ({ name: m, value: m })),
  );
}

async function handlePresetAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
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

    const doc = await AutoSurvivors.findOne({ discordId });
    const accountData = doc?.accounts?.get(mainAccount.accountId);

    if (!accountData || safeMapSize(accountData.presets) === 0) {
      await interaction.respond([{
        name: await translateForUser(discordId, 'survivors.autocomplete.noPresets', undefined, locale),
        value: 'none',
      }]);
      return;
    }

    const choices: { name: string; value: string }[] = [];
    for (const [name, preset] of safeMapEntries(accountData.presets)) {
      choices.push({
        name: `${name} (${preset.workers?.length ?? 0} workers)`.slice(0, 100),
        value: name,
      });
    }

    const filtered = choices.filter(c => c.name.toLowerCase().includes(focused));
    await interaction.respond(filtered.slice(0, 25));
  } catch (err: any) {
    log.commands.error({ error: err.message }, '[SURVIVORS] Autocomplete error (preset)');
    await interaction.respond([]);
  }
}

async function handleDeleteAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
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

    const doc = await AutoSurvivors.findOne({ discordId });
    const accountData = doc?.accounts?.get(mainAccount.accountId);

    if (!accountData) {
      await interaction.respond([{
        name: await translateForUser(discordId, 'survivors.autocomplete.noData', undefined, locale),
        value: 'none',
      }]);
      return;
    }

    const choices: { name: string; value: string }[] = [];

    for (const [name, preset] of safeMapEntries(accountData.presets)) {
      choices.push({
        name: `[Preset] ${name} (${preset.workers?.length ?? 0} workers)`.slice(0, 100),
        value: `preset:${name}`,
      });
    }

    for (const [missionType, presetName] of safeMapEntries(accountData.missionMappings)) {
      choices.push({
        name: `[Mapping] ${missionType} → ${presetName}`.slice(0, 100),
        value: `mapping:${missionType}`,
      });
    }

    if (choices.length === 0) {
      await interaction.respond([{
        name: await translateForUser(discordId, 'survivors.autocomplete.noData', undefined, locale),
        value: 'none',
      }]);
      return;
    }

    const filtered = choices.filter(c => c.name.toLowerCase().includes(focused));
    await interaction.respond(filtered.slice(0, 25));
  } catch (err: any) {
    log.commands.error({ error: err.message }, '[SURVIVORS] Autocomplete error (delete)');
    await interaction.respond([]);
  }
}

// ── Command ──────────────────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('survivors')
    .setDescription('AutoSurvivors presets and survivor collection images')
    .setNameLocalizations(buildDiscordLocalizations('survivors.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('survivors.cmd._1'))
    .addSubcommand(sub =>
      sub
        .setName('save')
        .setDescription('Save your current survivor squad layout as a preset')
        .setNameLocalizations(buildDiscordLocalizations('survivors.cmd.save.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('survivors.cmd._2'))
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('Name for this preset')
            .setNameLocalizations(buildDiscordLocalizations('survivors.cmd.options.name.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('survivors.cmd._3'))
            .setRequired(true)
            .setMaxLength(32),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Map a saved preset to a mission type')
        .setNameLocalizations(buildDiscordLocalizations('survivors.cmd.config.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('survivors.cmd._4'))
        .addStringOption(opt =>
          opt
            .setName('mission')
            .setDescription('Mission type')
            .setNameLocalizations(buildDiscordLocalizations('survivors.cmd.options.mission.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('autoloadout.cmd._3'))
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption(opt =>
          opt
            .setName('preset')
            .setDescription('Saved survivor preset to use')
            .setNameLocalizations(buildDiscordLocalizations('survivors.cmd.options.preset.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('survivors.cmd._5'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Remove a saved preset or mission mapping')
        .setNameLocalizations(buildDiscordLocalizations('survivors.cmd.delete.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('survivors.cmd._6'))
        .addStringOption(opt =>
          opt
            .setName('target')
            .setDescription('Preset or mapping to delete')
            .setNameLocalizations(buildDiscordLocalizations('survivors.cmd.options.target.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('survivors.cmd._7'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Show all saved presets and mission mappings')
        .setNameLocalizations(buildDiscordLocalizations('survivors.cmd.list.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('survivors.cmd._8')),
    )
    .addSubcommand((sub) =>
      addBulkOption(
        sub
          .setName('image')
          .setDescription('All survivors in your account as image grid(s)')
          .setNameLocalizations(buildDiscordLocalizations('survivors.cmd.image.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('survivors.cmd._9')),
        'stwCollection.bulk.optionDescription',
      ),
    )
    .setDMPermission(true) as unknown as SlashCommandBuilder,

  auth: true,
  automationSystem: 'autosurvivors',
  nodefer: false,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(false);
    const focused = interaction.options.getFocused(true);

    if (sub === 'config' || sub === 'configurar') {
      if (focused.name === 'mission' || focused.name === 'mision') {
        await handleMissionAutocomplete(interaction);
      } else if (focused.name === 'preset') {
        await handlePresetAutocomplete(interaction);
      }
    } else if (sub === 'delete' || sub === 'eliminar') {
      await handleDeleteAutocomplete(interaction);
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(true);

    switch (sub) {
      case 'save':
      case 'guardar':
        await handleSave(interaction);
        break;
      case 'config':
      case 'configurar':
        await handleConfig(interaction);
        break;
      case 'delete':
      case 'eliminar':
        await handleDelete(interaction);
        break;
      case 'list':
      case 'lista':
        await handleList(interaction);
        break;
      case 'image':
      case 'imagen':
        if (interaction.options.getBoolean('bulk')) {
          if (!await guardBulkMode(interaction)) return;
          const user = await UsuarioInfo.findOne({ id: interaction.user.id });
          if (!user?.deviceAuths?.length) {
            await replyEpicCredentialError(interaction, interaction.user.id, 'noCuenta');
            return;
          }
          await handleImageSurvivorsBulk(interaction);
        } else {
          await handleImageSurvivors(interaction);
        }
        break;
    }
  },
};

export default command;
