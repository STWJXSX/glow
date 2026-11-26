import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  ComponentType,
  AttachmentBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { buildDiscordLocalizations, translateForUser, getUserLanguage } from '#helpers/locales/index.ts';
import { getEmoji, getEmojiButtonComponent, getEmojiCdnUrl, EMOJI_IDS } from '#helpers/core/emojis.ts';
import { log } from '#helpers/core/logger.ts';
import { EMBED_COLORS, buildComponentsV2Payload, createV2Container } from '#helpers/core/embedHelper.ts';
import { translateAlertsZone } from '#helpers/epic/stw/alerts/alertsDisplayTranslations.ts';
import {
  INFO_ALERTS_IDLE_MS,
  isCollectorIdle,
} from '#helpers/commands/discord/info/infoCollectorHelper.ts';
import { editReplyInactive } from '#helpers/commands/epic/epicCollectorHelper.ts';
import { e, eByDiscordId } from '#helpers/epic/stw/alerts/emojiMap.ts';
import {
  getMissions,
  CATEGORIES,
  getMatchingRewards,
  getZoneEmoji,
  getPowerEmoji,
  type ZoneMissions,
  type ProcessedMission,
  type AlertRewardItem,
} from '#helpers/epic/stw/alerts/alertsHelper.ts';
import { generateStwWorldInfoViewImages } from '#managers/images/stw/world-info/index.ts';
import type { Client } from 'discord.js';
import type { SupportedLanguage } from '#helpers/locales/languages.ts';

const logger = log.commands;
const MISSIONS_PER_PAGE = 6;
const CID = 'alerts';
const ALERTS_ACCENT = EMBED_COLORS.info;
const NAV_LABEL = '\u200b';

const ZONE_NAV_EMOJI: Record<string, keyof typeof import('#helpers/core/emojis.ts').EMOJI_IDS> = {
  'V-Bucks': 'vbucks',
  Stonewood: 'stone',
  Plankerton: 'plankerton',
  'Canny Valley': 'canny',
  'Twine Peaks': 'twine',
  Ventures: 'ventures',
  Events: 'event',
};

function zoneNavEmoji(zone: string): keyof typeof import('#helpers/core/emojis.ts').EMOJI_IDS | undefined {
  return ZONE_NAV_EMOJI[zone];
}

function alertsHeaderContainer(): ContainerBuilder {
  return createV2Container('info');
}

function addEmojiHeaderSection(
  container: ContainerBuilder,
  emojiKey: keyof typeof EMOJI_IDS | undefined,
  content: string,
): ContainerBuilder {
  const thumbUrl = emojiKey ? getEmojiCdnUrl(emojiKey) : null;
  if (thumbUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
    );
    return container;
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  return container;
}

// Discord sums the raw content length of ALL TextDisplay components per message.
// Emoji strings like <:name:id> count in full (~30 chars each).
// Keep total under 3500 to stay safely within Discord's 4000-char limit.
const CONTENT_LIMIT = 3500;

// ── Helpers ────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return n.toLocaleString('en-US');
  return String(n);
}

function rewardLine(items: AlertRewardItem[], max = 3): string {
  return items
    .filter(r => r.emoji)
    .slice(0, max)
    .map(r => `${r.emoji} x${fmt(r.quantity)}`)
    .join('  ');
}

type AlertsCopy = Record<string, string>;

async function loadAlertsCopy(userId: string, locale?: string | null): Promise<AlertsCopy> {
  const paths = [
    'alerts.nav.overview',
    'alerts.nav.summary',
    'alerts.nav.prev',
    'alerts.nav.next',
    'alerts.overview.title',
    'alerts.overview.noMissions',
    'alerts.overview.more',
    'alerts.expand.showLess',
    'alerts.expand.showMore',
    'alerts.summary.title',
    'alerts.summary.subtitle',
    'alerts.summary.noRewards',
    'alerts.summary.missionsLine',
    'alerts.zone.missions',
    'alerts.zone.noMissions',
    'alerts.empty.noMissions',
    'alerts.errors.tokenFailed',
    'alerts.inactive',
    'alerts.categories.vbucks',
    'alerts.categories.legendary-survivors',
    'alerts.categories.pl-160',
    'alerts.categories.legendary-heroes',
    'alerts.categories.mythic-leads',
    'alerts.categories.perk-up',
    'alerts.categories.gold',
    'alerts.categories.xp',
  ] as const;

  const values = await Promise.all(
    paths.map((p) => translateForUser(userId, p, undefined, locale)),
  );
  const copy: AlertsCopy = {};
  for (let i = 0; i < paths.length; i++) {
    copy[paths[i].replace(/^alerts\./, '')] = values[i];
  }
  return copy;
}

function catTitle(copy: AlertsCopy, id: string, fallback: string): string {
  return copy[`categories.${id}`] ?? fallback;
}

function formatCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`,
  );
}

// ── State ──────────────────────────────────────────────────

interface ViewState {
  view: string;           // 'overview' | zone name
  page: number;           // 0-indexed, zone views only
  expandedCat: string;    // category id expanded in overview, '' = all categories
  useImage: boolean;      // slash option — kept for collector navigation
}

// ── Navigation ─────────────────────────────────────────────

function buildNavRows(zones: ZoneMissions[], state: ViewState, copy: AlertsCopy): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const overviewBtn = new ButtonBuilder()
    .setCustomId(`${CID}:overview`)
    .setLabel(NAV_LABEL)
    .setStyle(state.view === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(state.view === 'overview');
  const overviewEmoji = getEmojiButtonComponent('sumup');
  if (overviewEmoji) overviewBtn.setEmoji(overviewEmoji);

  const btns: ButtonBuilder[] = [overviewBtn];

  for (const z of zones) {
    const emojiKey = zoneNavEmoji(z.zone);
    const zoneBtn = new ButtonBuilder()
      .setCustomId(`${CID}:zone:${z.zone}`)
      .setLabel(NAV_LABEL)
      .setStyle(state.view === z.zone ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(state.view === z.zone);
    if (emojiKey) {
      const emoji = getEmojiButtonComponent(emojiKey);
      if (emoji) zoneBtn.setEmoji(emoji);
    }
    btns.push(zoneBtn);
  }

  // Split into rows of 5
  for (let i = 0; i < btns.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btns.slice(i, i + 5)));
  }

  // Page buttons (zone views with >1 page)
  const isZone = state.view !== 'overview';
  if (isZone) {
    const zd = zones.find(z => z.zone === state.view);
    if (zd) {
      const totalPages = Math.ceil(zd.missions.length / MISSIONS_PER_PAGE);
      if (totalPages > 1) {
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`${CID}:prev`)
              .setLabel(copy['nav.prev'])
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(state.page <= 0),
            new ButtonBuilder()
              .setCustomId(`${CID}:pageinfo`)
              .setLabel(`${state.page + 1} / ${totalPages}`)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`${CID}:next`)
              .setLabel(copy['nav.next'])
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(state.page >= totalPages - 1),
          ),
        );
      }
    }
  }

  return rows;
}

// ── Render: Overview ───────────────────────────────────────
// Always ONE ContainerBuilder per category, never splits into multiple containers.
//
// Component budget (Discord hard-limits all components to 40 per message):
//   header(2) + nav rows(≤14) + categories = 40
//   → ≤24 components available for category containers.
//   Each category costs 2 components (text only) or 4 (text + action row + button).
//
// Char budget (CONTENT_LIMIT) is tracked globally across all TextDisplay blocks.
// Expanded categories show as many missions as fit in the remaining char budget and
// display an accurate "+N more" footer for any that were cut.

// Conservative nav overhead: 2 rows (5 + 5 buttons) + potential pagination row (4) = 14
const COMPONENT_NAV_OVERHEAD = 14;
const CATEGORY_COMPONENT_MAX = 40 - 2 /* header */ - COMPONENT_NAV_OVERHEAD; // = 24

function buildOverviewMissionLine(
  m: ProcessedMission,
  cat: (typeof CATEGORIES)[number],
  pw: string,
): string {
  const zLabel = m.zone === 'V-Bucks' ? m.zoneGeo : m.zone;
  const ze = getZoneEmoji(zLabel) || getZoneEmoji(m.zone);
  const key = cat.rewardFilter
    ? getMatchingRewards(m, cat.rewardFilter).slice(0, 1).map(r => `${r.emoji} x${fmt(r.quantity)}`).join('')
    : '';
  return `${pw} \`${m.power}\` ${m.missionEmoji} **${m.missionName}** · ${ze} ${zLabel}${key ? `  ${key}` : ''}`;
}

function renderOverview(zones: ZoneMissions[], expandedCat: string, copy: AlertsCopy, client: Client): ContainerBuilder[] {
  const all = zones.flatMap(z => z.missions);
  const pw = getPowerEmoji();
  const result: ContainerBuilder[] = [];
  let totalChars = 0;
  let usedCategoryComponents = 0;

  // Header (2 components)
  const overviewEmoji = e('world_atlas', '') || eByDiscordId(EMOJI_IDS.sumup, '');
  const headerText = `# ${overviewEmoji} __${copy['overview.title']}__`;
  totalChars += headerText.length;
  result.push(
    alertsHeaderContainer()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText)),
  );

  for (const cat of CATEGORIES) {
    const isExpanded = expandedCat === cat.id;
    const matches = all.filter(cat.filter);
    const priority = [...matches.filter(m => m.hasAlerts), ...matches.filter(m => !m.hasAlerts)];
    const hasButton = matches.length > 2;

    // Component cost: container(1) + textDisplay(1) + optional actionRow(1) + button(1)
    const catCost = hasButton || isExpanded ? 4 : 2;

    // Stop if adding this category would exceed the 40-component ceiling or char limit
    if (usedCategoryComponents + catCost > CATEGORY_COMPONENT_MAX) break;
    if (totalChars >= CONTENT_LIMIT - 100) break;

    const catEmoji = e(cat.emojiName);
    const title = catTitle(copy, cat.id, cat.title);
    const headerLine = `## ${catEmoji} ${title}  ·  \`${matches.length}\``;
    const lines: string[] = [headerLine];
    let blockChars = headerLine.length;

    // Per-category char budget: remaining global budget minus a 120-char headroom
    // for newlines, the "+N more" footer, and future categories.
    const charBudget = CONTENT_LIMIT - totalChars - 120;
    const missionCap = isExpanded ? Infinity : 2;
    let shown = 0;

    if (matches.length === 0) {
      lines.push(`-# ${copy['overview.noMissions']}`);
    } else {
      for (const m of priority) {
        if (shown >= missionCap) break;
        const mLine = buildOverviewMissionLine(m, cat, pw);
        // Leave ~22 chars for the potential "-# +N more\n" footer
        if (blockChars + 1 + mLine.length + 22 > charBudget) break;
        lines.push(mLine);
        blockChars += 1 + mLine.length;
        shown++;
      }
    }

    const hidden = matches.length - shown;
    if (hidden > 0) lines.push(`-# ${formatCopy(copy['overview.more'], { count: hidden })}`);

    const content = lines.join('\n');
    totalChars += content.length;
    usedCategoryComponents += catCost;

    const cb = new ContainerBuilder()
      .setAccentColor(ALERTS_ACCENT)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

    if (hasButton || isExpanded) {
      cb.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          isExpanded
            ? new ButtonBuilder()
                .setCustomId(`${CID}:expand:${cat.id}`)
                .setLabel(copy['expand.showLess'])
                .setStyle(ButtonStyle.Secondary)
            : new ButtonBuilder()
                .setCustomId(`${CID}:expand:${cat.id}`)
                .setLabel(formatCopy(copy['expand.showMore'], { count: matches.length - 2 }))
                .setStyle(ButtonStyle.Secondary),
        ),
      );
    }

    result.push(cb);
  }

  return result;
}

function renderOverviewHeaderOnly(_copy: AlertsCopy, _client: Client): ContainerBuilder[] {
  return [alertsHeaderContainer()];
}

// ── Render: Zone (paginated, 6 per page, auto-split) ───────
// Builds per-mission text blocks and flushes into a new container
// whenever the running raw char count approaches CONTENT_LIMIT.

function buildMissionText(m: ProcessedMission, isVBucks: boolean, pw: string): string {
  const parts: string[] = [];

  let title = `${pw} \`${m.power}\` ${m.missionEmoji} **${m.missionName}**`;
  if (isVBucks) title += ` · ${getZoneEmoji(m.zoneGeo)} ${m.zoneGeo}`;
  parts.push(title);

  if (m.alerts.length > 0) {
    const ar = rewardLine(m.alerts);
    if (ar) parts.push(ar);
  }
  if (m.rewards.length > 0) {
    const rr = rewardLine(m.rewards);
    if (rr) parts.push(`-# ${rr}`);
  }
  if (m.modifiers.length > 0) {
    const mods = m.modifiers
      .slice(0, 3)
      .map(mod => (mod.emoji ? `${mod.emoji} ${mod.name}` : mod.name))
      .join(' · ');
    parts.push(`-# ${mods}`);
  }

  return parts.join('\n');
}

function renderZone(zoneName: string, zones: ZoneMissions[], page: number, copy: AlertsCopy, _client: Client): ContainerBuilder[] {
  const zd = zones.find(z => z.zone === zoneName);
  const ze = getZoneEmoji(zoneName);
  if (!zd) {
    return [
      new ContainerBuilder()
        .setAccentColor(ALERTS_ACCENT)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${ze} ${zoneName}\n${copy['zone.noMissions']}`),
        ),
    ];
  }

  const total = zd.missions.length;
  const totalPages = Math.ceil(total / MISSIONS_PER_PAGE);
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * MISSIONS_PER_PAGE;
  const pageMissions = zd.missions.slice(start, start + MISSIONS_PER_PAGE);

  const pw = getPowerEmoji();
  const isVBucks = zoneName === 'V-Bucks';

  const headerText = [
    `# ${ze} ${zoneName}`,
    `-# ${total} ${copy['zone.missions']}${totalPages > 1 ? ` · Page ${safePage + 1}/${totalPages}` : ''}`,
  ].join('\n');

  const containers: ContainerBuilder[] = [
    alertsHeaderContainer()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText)),
  ];

  // Each mission becomes a text block; flush into a new container when approaching the limit.
  let batch: string[] = [];
  let batchChars = headerText.length;

  for (const m of pageMissions) {
    const mText = buildMissionText(m, isVBucks, pw);
    const needed = mText.length + 2; // +2 for the \n\n separator

    if (batchChars + needed > CONTENT_LIMIT && batch.length > 0) {
      // Flush current batch
      containers.push(
        new ContainerBuilder()
          .setAccentColor(ALERTS_ACCENT)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(batch.join('\n\n'))),
      );
      batch = [mText];
      batchChars = mText.length + 2;
    } else {
      batch.push(mText);
      batchChars += needed;
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    containers.push(
      new ContainerBuilder()
        .setAccentColor(ALERTS_ACCENT)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(batch.join('\n\n'))),
    );
  }

  return containers;
}

function renderZoneHeaderOnly(
  zoneName: string,
  zones: ZoneMissions[],
  page: number,
  copy: AlertsCopy,
  client: Client,
): ContainerBuilder[] {
  const zd = zones.find((z) => z.zone === zoneName);
  const zoneEmojiKey = zoneNavEmoji(zoneName);
  const zoneEmoji = zoneEmojiKey ? getEmoji(client, zoneEmojiKey) : getZoneEmoji(zoneName);

  if (!zd) {
    return [
      new ContainerBuilder()
        .setAccentColor(ALERTS_ACCENT)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${zoneEmoji}\n${copy['zone.noMissions']}`),
        ),
    ];
  }

  const total = zd.missions.length;
  const totalPages = Math.ceil(total / MISSIONS_PER_PAGE);
  const safePage = Math.min(page, totalPages - 1);
  const headerText = `-# ${total} ${copy['zone.missions']}${totalPages > 1 ? ` · Page ${safePage + 1}/${totalPages}` : ''}`;

  return [addEmojiHeaderSection(alertsHeaderContainer(), zoneEmojiKey, headerText)];
}

function renderCategoryHeaderOnly(
  categoryId: string,
  zones: ZoneMissions[],
  copy: AlertsCopy,
): ContainerBuilder[] {
  const cat = CATEGORIES.find((entry) => entry.id === categoryId);
  if (!cat) return [];

  const all = zones.flatMap((z) => z.missions);
  const matches = all.filter(cat.filter);
  const catEmoji = e(cat.emojiName);
  const headerLine = `## ${catEmoji}  ·  \`${matches.length}\``;

  return [
    alertsHeaderContainer()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLine)),
  ];
}

function shouldUseAlertsImage(state: ViewState): boolean {
  return state.useImage;
}

function attachImageGallery(
  containers: ContainerBuilder[],
  attachments: AttachmentBuilder[],
): ContainerBuilder[] {
  if (!attachments.length) return containers;

  const host = containers[0] ?? alertsHeaderContainer();
  host.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  const gallery = new MediaGalleryBuilder();
  for (const file of attachments) {
    const name = file.name ?? 'stw-alerts.webp';
    gallery.addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`));
  }
  host.addMediaGalleryComponents(gallery);

  if (!containers.length) return [host];
  return [host, ...containers.slice(1)];
}

function attachSplitImageContainers(
  headerContainers: ContainerBuilder[],
  attachments: AttachmentBuilder[],
): ContainerBuilder[] {
  if (!attachments.length) return headerContainers;

  const result = [...headerContainers];
  for (const file of attachments) {
    const container = alertsHeaderContainer();
    const name = file.name ?? 'stw-alerts.webp';
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${name}`),
      ),
    );
    result.push(container);
  }
  return result;
}

function shouldSplitOverviewImages(state: ViewState, attachmentCount: number): boolean {
  return state.view === 'overview' && !state.expandedCat && attachmentCount > 1;
}

// ── Render dispatcher ──────────────────────────────────────

function renderView(
  state: ViewState,
  zones: ZoneMissions[],
  copy: AlertsCopy,
  client: Client,
  imagePrimary = false,
): ContainerBuilder[] {
  if (imagePrimary && state.view === 'overview' && state.expandedCat) {
    return renderCategoryHeaderOnly(state.expandedCat, zones, copy);
  }
  if (imagePrimary && state.view === 'overview') {
    return renderOverviewHeaderOnly(copy, client);
  }
  if (imagePrimary && state.view !== 'overview') {
    return renderZoneHeaderOnly(state.view, zones, state.page, copy, client);
  }
  if (state.view === 'overview') return renderOverview(zones, state.expandedCat, copy, client);
  return renderZone(state.view, zones, state.page, copy, client);
}

function buildAlertsReply(
  containers: ContainerBuilder[],
  navRows: ActionRowBuilder<ButtonBuilder>[],
  files: AttachmentBuilder[],
  imagePrimary: boolean,
) {
  if (imagePrimary && files.length > 0) {
    const host = containers[containers.length - 1] ?? alertsHeaderContainer();
    if (navRows.length > 0) {
      host.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      for (const row of navRows) {
        host.addActionRowComponents(row);
      }
    }

    if (containers.length === 1) {
      return buildComponentsV2Payload(containers[0], { files });
    }

    return {
      content: null,
      embeds: [] as [],
      files,
      components: containers.map((container) => container.toJSON()),
      flags: MessageFlags.IsComponentsV2,
    };
  }

  return {
    content: null,
    embeds: [] as [],
    files,
    components: [...containers, ...navRows],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function buildAlertsAttachments(
  userId: string,
  state: ViewState,
  zones: ZoneMissions[],
  copy: AlertsCopy,
  lang: SupportedLanguage,
): Promise<AttachmentBuilder[]> {
  if (!shouldUseAlertsImage(state)) return [];

  try {
    const categoryTitles = Object.fromEntries(
      CATEGORIES.map((cat) => [cat.id, catTitle(copy, cat.id, cat.title)]),
    );
    const zoneTitles = Object.fromEntries(
      zones.map((zone) => [zone.zone, translateAlertsZone(zone.zone, lang)]),
    );
    const images = await generateStwWorldInfoViewImages({
      zones,
      state,
      lang,
      categoryTitles,
      zoneTitles,
      missionsPerPage: MISSIONS_PER_PAGE,
    });
    if (!images.length) {
      logger.warn({ view: state.view, page: state.page }, '[alerts] no images generated');
      return [];
    }

    return images.map((image, index) => {
      const name = `alerts-${userId.slice(-8)}-${index + 1}-${image.fileName}`;
      return new AttachmentBuilder(image.buffer, { name });
    });
  } catch (err) {
    logger.error({ err, view: state.view }, '[alerts] image generation failed');
    return [];
  }
}

function buildAlertsComponents(
  state: ViewState,
  zones: ZoneMissions[],
  copy: AlertsCopy,
  client: Client,
  attachments: AttachmentBuilder[],
): ContainerBuilder[] {
  const imagePrimary = attachments.length > 0 && shouldUseAlertsImage(state);
  const containers = renderView(state, zones, copy, client, imagePrimary);
  if (!imagePrimary) return containers;

  if (shouldSplitOverviewImages(state, attachments.length)) {
    return attachSplitImageContainers(containers, attachments);
  }

  return attachImageGallery(containers, attachments);
}

// ── Command ────────────────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('alerts')
    .setDescription('View Save the World mission alerts')
    .setNameLocalizations(buildDiscordLocalizations('alerts.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('alerts.cmd._1'))
    .addBooleanOption((opt) =>
      opt
        .setName('image')
        .setDescription('Show alerts as generated images instead of text')
        .setNameLocalizations(buildDiscordLocalizations('alerts.cmd.options.image.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('alerts.cmd.options.image.description'))
        .setRequired(false),
    ),

  auth: true,
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    try {
      // ── Auth ──────────────────────────────────────
      const userDb = await UsuarioInfo.findOne({ id: userId });
      if (!userDb) {
        const embed = await generarEmbedError('noCuenta', {
          client: interaction.client,
          interaction,
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const mainAccount = userDb.deviceAuths.find((acc: any) => acc.cuentaMain);
      if (!mainAccount) {
        const embed = await generarEmbedError('noMain', {
          client: interaction.client,
          interaction,
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const account = mainAccount;

      const copy = await loadAlertsCopy(userId, interaction.locale);
      const lang = await getUserLanguage(userId, interaction.locale);

      // ── Loading ───────────────────────────────────
      const emojiLoading = getEmoji(interaction.client, 'loading');

      // ── Fetch missions ────────────────────────────
      let zones: ZoneMissions[];
      try {
        zones = await getMissions(account.accessToken);
      } catch (err: any) {
        logger.error({ err }, '[alerts] Failed to fetch world info');
        const embed = await generarEmbedError('api', {
          apiError: err,
          client: interaction.client,
          interaction,
        });
        await interaction.editReply({ content: null, embeds: [embed] });
        return;
      }

      if (zones.length === 0) {
        await interaction.editReply({
          content: copy['empty.noMissions'],
          embeds: [],
          components: [],
        });
        return;
      }

      // ── Initial render ────────────────────────────
      const useImage = interaction.options.getBoolean('image') ?? false;
      const state: ViewState = { view: 'overview', page: 0, expandedCat: '', useImage };
      const files = await buildAlertsAttachments(userId, state, zones, copy, lang);
      const imagePrimary = useImage && files.length > 0;
      const containers = buildAlertsComponents(state, zones, copy, interaction.client, files);
      const navRows = buildNavRows(zones, state, copy);

      const reply = await interaction.editReply(
        buildAlertsReply(containers, navRows, files, imagePrimary) as any,
      );

      // ── Button collector ──────────────────────────
      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === userId && i.customId.startsWith(`${CID}:`),
        idle: INFO_ALERTS_IDLE_MS,
      });

      collector.on('collect', async (i) => {
        try {
          const id = i.customId.slice(CID.length + 1);

          if (id === 'overview') {
            state.view = 'overview';
            state.page = 0;
            state.expandedCat = '';
          } else if (id.startsWith('zone:')) {
            const newZone = id.slice(5);
            if (newZone !== state.view) {
              state.view = newZone;
              state.page = 0;
              state.expandedCat = '';
            }
          } else if (id.startsWith('expand:')) {
            const catId = id.slice(7);
            // Toggle: collapse if already expanded, otherwise expand (only one at a time)
            state.expandedCat = state.expandedCat === catId ? '' : catId;
          } else if (id === 'prev') {
            state.page = Math.max(0, state.page - 1);
          } else if (id === 'next') {
            const zd = zones.find(z => z.zone === state.view);
            const maxPage = zd ? Math.ceil(zd.missions.length / MISSIONS_PER_PAGE) - 1 : 0;
            state.page = Math.min(maxPage, state.page + 1);
          }

          const files = await buildAlertsAttachments(userId, state, zones, copy, lang);
          const imagePrimary = state.useImage && files.length > 0;
          const newContainers = buildAlertsComponents(state, zones, copy, interaction.client, files);
          const newNavRows = buildNavRows(zones, state, copy);

          await i.update(
            buildAlertsReply(newContainers, newNavRows, files, imagePrimary) as any,
          );
        } catch (err) {
          logger.error({ err }, '[alerts] Button interaction error');
        }
      });

      collector.on('end', async (_, reason) => {
        if (!isCollectorIdle(reason)) return;
        try {
          const inactive = await translateForUser(interaction.user.id, 'alerts.inactive', undefined, interaction.locale);
          await editReplyInactive(interaction, inactive, { clearFiles: true });
        } catch {
          // Ignore
        }
      });
    } catch (err: any) {
      logger.error({ err }, '[alerts] Unexpected error');
      const embed = await generarEmbedError('custom', {
        descripcion: 'An unexpected error occurred.',
        client: interaction.client,
        interaction,
      });
      await interaction.editReply({ embeds: [embed] }).catch(() => {});
    }
  },
};

export default command;
