import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  ComponentType,
} from 'discord.js';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicReplyPayload,
  epicQuote,
  epicSection,
  getEpicAuthor,
  replyEpicCustomError,
  replyEpicCredentialError,
  replyWithEpicEmbed,
  translateEpic,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_PANEL_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { callCore, callCoreWithTimeout } from '#api/glowCore.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { getUserLanguage } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import {
  CollectionBookCatalogManager,
  type CollectionBookStatusSnapshot,
} from '#managers/epic/stw/collectionbook/CollectionBookCatalogManager.ts';
import type { CBItem, CBItemType, Rarity } from '#managers/epic/stw/collectionbook/types.ts';
import { MAX_LEVEL_BY_RARITY } from '#managers/epic/stw/collectionbook/collectionBookUpgradeCosts.ts';
import {
  collectionBookKindOrder,
  collectionBookRarityOrder,
  formatCompactCostLines,
  getCollectionBookKindEmoji,
} from './collectionBookEmojis.ts';
import { buildAccountMaterialSnapshot } from './collectionBookMaterialInventory.ts';


const MAX_LEVEL_BY_RARITY_PANEL: Partial<Record<Rarity, number>> = MAX_LEVEL_BY_RARITY;

const DISCORD_EMBED_DESC_MAX = 4000;

type PanelTab = 'status' | 'materials';

function panelPrefix(interactionId: string): string {
  return `cb_panel_${interactionId}`;
}

function clampEmbedDescription(text: string, max = DISCORD_EMBED_DESC_MAX): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf('\n', max - 20);
  const at = cut > max * 0.6 ? cut : max - 20;
  return `${text.slice(0, at)}\n…`;
}

async function kindLabel(userId: string, kind: string, locale?: string | null): Promise<string> {
  const key = `collectionbook.kinds.${kind}`;
  const translated = await translateForUser(userId, key, undefined, locale);
  if (translated !== key) return translated;
  return kind.replace(/_/g, ' ');
}

async function buildCompactKindRows(
  client: Client,
  userId: string,
  data: Record<string, Record<string, number>>,
  locale: string | null | undefined,
  emptyKey: string,
): Promise<string[]> {
  const kinds = collectionBookKindOrder().filter((k) => data[k] && Object.keys(data[k]!).length > 0);
  if (!kinds.length) {
    return [epicQuote(await translateForUser(userId, emptyKey, undefined, locale))];
  }

  const rows: string[] = [];
  for (const kind of kinds) {
    const parts: string[] = [];
    for (const rarity of collectionBookRarityOrder()) {
      const count = data[kind]?.[rarity];
      if (!count) continue;
      parts.push(`${getCollectionBookKindEmoji(client, kind, rarity)} \`${count}\``);
    }
    if (!parts.length) continue;
    const kindEmoji = getCollectionBookKindEmoji(client, kind, 'sr');
    const kindName = await kindLabel(userId, kind, locale);
    rows.push(`${kindEmoji} **${kindName}** · ${parts.join(' | ')}`);
  }
  return rows;
}

async function buildPanelHeader(
  client: Client,
  userId: string,
  locale: string | null | undefined,
  bookLevel: number | undefined,
  status: CollectionBookStatusSnapshot,
  slottedCount: number,
): Promise<string[]> {
  const { catalogGap, belowMaxCount } = status;
  const powerEmoji = getEmoji(client, 'stw_power') as string;
  const lines: string[] = [];

  const title = await translateForUser(userId, 'collectionbook.panel.title', undefined, locale);
  const levelLabel = await translateForUser(userId, 'collectionbook.view.level', undefined, locale);
  const header = bookLevel != null ? `${title} · ${levelLabel} **${bookLevel}**` : title;
  lines.push(epicQuote(header));

  if (catalogGap.catalogAvailable) {
    const stats = await translateForUser(userId, 'collectionbook.panel.statsLine', {
      filled: String(catalogGap.filledSlots),
      missing: String(catalogGap.missingSlots),
      catalog: String(catalogGap.catalogSlots),
      slotted: String(slottedCount),
    }, locale);
    lines.push(epicQuote(stats));
  }

  lines.push(epicQuote(`${powerEmoji} ${await translateForUser(userId, 'collectionbook.panel.belowMax', { count: String(belowMaxCount) }, locale)}`));
  return lines;
}

async function buildStatusPage(
  client: Client,
  userId: string,
  locale: string | null | undefined,
  bookLevel: number | undefined,
  status: CollectionBookStatusSnapshot,
  slottedCount: number,
): Promise<string> {
  const { summaryByKindRarity } = status;
  const lines: string[] = [
    ...await buildPanelHeader(client, userId, locale, bookLevel, status, slottedCount),
    '',
  ];

  lines.push(epicSection(await translateForUser(userId, 'collectionbook.panel.ownedByType', undefined, locale)));
  lines.push(...await buildCompactKindRows(
    client, userId, summaryByKindRarity.filled, locale, 'collectionbook.panel.noOwned',
  ));

  lines.push('');
  lines.push(epicSection(await translateForUser(userId, 'collectionbook.panel.missingByType', undefined, locale)));
  lines.push(...await buildCompactKindRows(
    client, userId, summaryByKindRarity.missing, locale, 'collectionbook.panel.noMissing',
  ));

  return clampEmbedDescription(lines.join('\n'));
}

async function buildCostLabelResolver(
  userId: string,
  locale: string | null | undefined,
): Promise<(id: string) => string> {
  const duplicateLabels = new Map<string, string>();
  const kindKeys: Record<string, string> = {
    hero: 'collectionbook.costs.duplicateHero',
    schematic: 'collectionbook.costs.duplicateSchematic',
    worker: 'collectionbook.costs.duplicateSurvivor',
    manager: 'collectionbook.costs.duplicateLead',
    defender: 'collectionbook.costs.duplicateDefender',
  };

  for (const rarity of collectionBookRarityOrder()) {
    const rarityLabel = await translateForUser(userId, `collectionbook.rarities.${rarity}`, undefined, locale);
    for (const [kind, key] of Object.entries(kindKeys)) {
      duplicateLabels.set(
        `__evo:${kind}:${rarity}`,
        await translateForUser(userId, key, { rarity: rarityLabel }, locale),
      );
    }
  }

  return (id: string) => duplicateLabels.get(id) ?? '';
}

async function buildMaterialsPage(
  client: Client,
  userId: string,
  locale: string | null | undefined,
  status: CollectionBookStatusSnapshot,
  campaignItems: Record<string, { templateId?: string; quantity?: number }>,
): Promise<string> {
  const costs = CollectionBookCatalogManager.loadUpgradeCosts();
  const catalog = costs?.catalog;
  const { materials } = status;
  const lines: string[] = [];
  const labelFor = await buildCostLabelResolver(userId, locale);
  const inventory = buildAccountMaterialSnapshot(campaignItems);
  const statusEmoji = {
    ok: getEmoji(client, 'success') as string,
    fail: getEmoji(client, 'error') as string,
  };

  const upgradeLines = formatCompactCostLines(
    materials.upgradesPending, catalog, labelFor, inventory, statusEmoji,
  );
  if (upgradeLines.length) {
    lines.push(epicSection(await translateForUser(userId, 'collectionbook.panel.materialsUpgrades', undefined, locale)));
    lines.push(...upgradeLines);
  }

  const totalLines = formatCompactCostLines(
    materials.total, catalog, labelFor, inventory, statusEmoji,
  );
  if (totalLines.length) {
    lines.push('');
    lines.push(epicSection(await translateForUser(userId, 'collectionbook.panel.materialsTotal', undefined, locale)));
    lines.push(...totalLines);
  }

  if (!lines.length) {
    lines.push(epicQuote(await translateForUser(userId, 'collectionbook.panel.noMaterials', undefined, locale)));
  } else {
    lines.push('');
    lines.push(epicQuote(await translateForUser(userId, 'collectionbook.panel.materialsEvolve', undefined, locale)));
  }

  return clampEmbedDescription(lines.join('\n'));
}

async function runUpgradeAll(
  interaction: ChatInputCommandInteraction,
  account: { accountId: string; accessToken: string; displayName?: string },
  userId: string,
  locale: string | null | undefined,
  lang: SupportedLanguage,
  client: Client,
  bookLevel: number | undefined,
): Promise<void> {
  const data = await callCoreWithTimeout<{ items: CBItem[] }>('collectionbook.fetch', 60_000, {
    accountId: account.accountId,
    accessToken: account.accessToken,
  });
  const candidates = data.items.filter((item) => {
    const max = MAX_LEVEL_BY_RARITY_PANEL[item.rarity];
    return max !== undefined && item.level < max && item.type !== 'Page';
  });

  const authorData = await getEpicAuthor(userId, {
    accountId: account.accountId,
    accessToken: account.accessToken,
    displayName: account.displayName ?? '',
  });

  if (!candidates.length) {
    await replyEpicCustomError(interaction, userId, 'collectionbook.upgrade.noItems');
    return;
  }

  const title = await translateForUser(userId, 'collectionbook.upgrade.title', undefined, locale);
  const workingMsg = await translateForUser(userId, 'collectionbook.upgrade.working', {
    count: String(candidates.length),
  }, locale);
  const workingPayload = await buildEpicReplyPayload(userId, {
    loading: true,
    title,
    description: workingMsg,
    author: authorData,
    footerKey: 'brand',
  }, interaction, locale);
  await interaction.editReply({ ...workingPayload, components: [] });

  const alreadyMax = data.items.filter((item) => {
    const max = MAX_LEVEL_BY_RARITY_PANEL[item.rarity];
    return max !== undefined && item.level >= max && item.type !== 'Page';
  }).length;

  const upgradeResult = await callCoreWithTimeout<{
    upgraded: Partial<Record<CBItemType, number>>;
    failed: number;
    stoppedEarly: boolean;
  }>('collectionbook.upgrade', 10 * 60_000, {
    accountId: account.accountId,
    accessToken: account.accessToken,
    discordId: userId,
    items: candidates.map((item) => ({
      itemId: item.itemId,
      templateId: item.templateId,
      type: item.type,
      rarity: item.rarity,
      rarityRaw: item.rarityRaw,
      level: item.level,
      tier: item.tier,
      power: item.power,
      profile: item.profile,
      maxLevel: MAX_LEVEL_BY_RARITY_PANEL[item.rarity]!,
    })),
  });
  const upgraded = upgradeResult.upgraded;
  const failed = upgradeResult.failed;
  const stoppedEarly = upgradeResult.stoppedEarly;

  const totalUpgraded = Object.values(upgraded).reduce((a, b) => a + (b ?? 0), 0);
  const upgLabel = await translateForUser(userId, 'collectionbook.upgrade.upgraded', undefined, locale);
  const maxLabel = await translateForUser(userId, 'collectionbook.upgrade.alreadyMax', undefined, locale);
  const failLabel = await translateForUser(userId, 'collectionbook.upgrade.failed', undefined, locale);
  const levelLabel = await translateForUser(userId, 'collectionbook.view.level', undefined, locale);
  const header = bookLevel != null
    ? `${await translateForUser(userId, 'collectionbook.upgrade.title', undefined, locale)} · ${levelLabel} ${bookLevel}`
    : await translateForUser(userId, 'collectionbook.upgrade.title', undefined, locale);

  const lines = [
    epicQuote(header),
    epicQuote(`**${totalUpgraded}** ${upgLabel} · **${alreadyMax}** ${maxLabel} · **${failed}** ${failLabel}`),
  ];

  if (stoppedEarly) {
    lines.push(epicQuote(await translateEpic(
      client, userId, 'collectionbook.upgrade.stoppedEarly', 'warning', undefined, locale,
    )));
  }

  const typeOrder: CBItemType[] = ['Hero', 'Survivor', 'Manager', 'Defender', 'Weapon', 'Trap'];
  for (const t of typeOrder) {
    const count = upgraded[t];
    if (!count) continue;
    const emoji = getCollectionBookKindEmoji(client, t === 'Hero' ? 'hero'
      : t === 'Weapon' ? 'weapon'
        : t === 'Trap' ? 'trap'
          : t === 'Defender' ? 'defender'
            : t === 'Manager' ? 'survivor_leader' : 'survivor_normal', 'sr');
    const label = await translateForUser(userId, `collectionbook.types.${t}`, undefined, locale);
    lines.push(epicQuote(`${emoji} **${label}:** ${count}`));
  }

  await replyWithEpicEmbed(interaction, userId, {
    style: stoppedEarly ? 'warning' : 'success',
    title,
    description: lines.join('\n'),
    author: authorData,
    timestamp: true,
    footerKey: 'brand',
  });
}

export async function runCollectionBookPanel(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const lang = (await getUserLanguage(userId, locale)) as SupportedLanguage;
  const client = interaction.client;

  if (!CollectionBookCatalogManager.isCatalogAvailable()) {
    await replyEpicCustomError(interaction, userId, 'collectionbook.panel.noCatalog');
    return;
  }

  const userInfo = await UsuarioInfo.findOne({ id: userId });
  if (!userInfo?.deviceAuths?.length) {
    await replyEpicCredentialError(interaction, userId, 'noCuenta');
    return;
  }
  const mainAccount = userInfo.deviceAuths.find((a) => a.cuentaMain);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return;
  }

  const account = mainAccount;
  const authorData = await getEpicAuthor(userId, {
    accountId: account.accountId,
    accessToken: account.accessToken,
    displayName: mainAccount.displayName,
  });

  let cbData: { items: CBItem[] };
  let bookLevel: number | undefined;
  let campaignItems: Record<string, { templateId?: string; quantity?: number }> = {};
  try {
    const data = await callCoreWithTimeout<{
      items: CBItem[];
      bookLevel?: number;
      campaignItems: Record<string, { templateId?: string; quantity?: number }>;
    }>('collectionbook.fetch', 60_000, {
      accountId: account.accountId,
      accessToken: account.accessToken,
    });
    cbData = { items: data.items };
    bookLevel = data.bookLevel;
    campaignItems = data.campaignItems;
  } catch {
    await replyEpicCustomError(interaction, userId, 'collectionbook.view.fetchError');
    return;
  }

  const status = CollectionBookCatalogManager.buildStatus(cbData.items);
  if (!status) {
    await replyEpicCustomError(interaction, userId, 'collectionbook.panel.noCosts');
    return;
  }
  const bookStatus = status;

  const slottedCount = cbData.items.filter((i) => i.type !== 'Page').length;
  const prefix = panelPrefix(interaction.id);
  let activeTab: PanelTab = 'status';

  const title = await translateForUser(userId, 'collectionbook.panel.title', undefined, locale);
  const tabStatusLabel = await translateForUser(userId, 'collectionbook.panel.tabOverview', undefined, locale);
  const tabMaterialsLabel = await translateForUser(userId, 'collectionbook.panel.tabMaterials', undefined, locale);
  const upgradeLabel = await translateForUser(userId, 'collectionbook.panel.buttonUpgrade', undefined, locale);

  async function buildDescription(): Promise<string> {
    if (activeTab === 'materials') {
      return buildMaterialsPage(client, userId, locale, bookStatus, campaignItems);
    }
    return buildStatusPage(client, userId, locale, bookLevel, bookStatus, slottedCount);
  }

  async function buildReply() {
    const payload = await buildEpicReplyPayload(userId, {
      style: 'info',
      title,
      description: await buildDescription(),
      author: authorData,
      timestamp: true,
      footerKey: 'brand',
    }, interaction, locale);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}_tab_status`)
        .setLabel(tabStatusLabel)
        .setStyle(activeTab === 'status' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${prefix}_tab_materials`)
        .setLabel(tabMaterialsLabel)
        .setStyle(activeTab === 'materials' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${prefix}_upgrade`)
        .setLabel(upgradeLabel)
        .setStyle(ButtonStyle.Success),
    );
    return { ...payload, components: [row] };
  }

  await interaction.editReply(await buildReply());

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (btn) => btn.customId.startsWith(prefix),
    idle: EPIC_PANEL_IDLE_MS,
  });

  collector.on('collect', async (btn: ButtonInteraction) => {
    if (btn.user.id !== userId) {
      await btn.reply({
        content: await translateForUser(userId, 'collectionbook.panel.onlyUser', undefined, locale),
        ephemeral: true,
      });
      return;
    }

    if (btn.customId === `${prefix}_tab_status`) {
      activeTab = 'status';
      await btn.deferUpdate();
      await interaction.editReply(await buildReply());
      return;
    }

    if (btn.customId === `${prefix}_tab_materials`) {
      activeTab = 'materials';
      await btn.deferUpdate();
      await interaction.editReply(await buildReply());
      return;
    }

    if (btn.customId !== `${prefix}_upgrade`) return;

    await btn.deferUpdate();
    collector.stop('upgrade');
    const { account: fresh } = await refreshAccountToken(userInfo, mainAccount.accountId);
    if (!fresh) {
      await replyEpicCustomError(interaction, userId, 'collectionbook.view.fetchError');
      return;
    }
    await runUpgradeAll(interaction, {
      accountId: fresh.accountId,
      accessToken: fresh.accessToken,
      displayName: fresh.displayName ?? mainAccount.displayName,
    }, userId, locale, lang, client, bookLevel);
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'upgrade' || !isCollectorIdle(reason)) return;
    try {
      const inactive = await translateForUser(userId, 'epic.inactivePagination', undefined, locale);
      await editReplyInactive(interaction, inactive);
    } catch { /* expired */ }
  });
}
