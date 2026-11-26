import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { type AuthorData } from '#helpers/epic/account/avatarHandler.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { translateHeroName } from '#helpers/locales/gameTranslations.ts';
import { log } from '#helpers/core/logger.ts';
import { e, eAsset, eSuffix, eGadget } from '#helpers/epic/stw/alerts/emojiMap.ts';
import { callCore, callCoreWithTimeout } from '#api/glowCore.ts';
import type { GamePanelProfileResult, KickMembersResult, PartyState, RewardsMap } from '../epic/party/types.ts';
import {
  buildEpicEmbed,
  epicQuote,
  epicSection,
  getEpicAuthor,
  replyEpicCredentialError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epic/epicEmbedHelper.ts';
import { EPIC_PANEL_IDLE_MS, editReplyInactive, isCollectorIdle } from '../epic/epicCollectorHelper.ts';
import { resolveStwHeroesAllRoot } from '#helpers/core/glowAssetPaths.ts';

const logger = log.commands;
const MAX_LOADOUT_BUTTONS = 20;
const HEROES_ROOT = resolveStwHeroesAllRoot();

const CLASS_MAP: Record<string, { folder: string; label: string; emojiKey: string }> = {
  commando: { folder: 'Soldier', label: 'Soldier', emojiKey: 'soldat' },
  ninja: { folder: 'Ninja', label: 'Ninja', emojiKey: 'ninja' },
  constructor: { folder: 'Constructor', label: 'Constructor', emojiKey: 'constructor' },
  outlander: { folder: 'Outlander', label: 'Outlander', emojiKey: 'outlander' },
};

const RARITY_VARIANT: Record<string, string> = {
  sr: 'VariantLegendary', ssr: 'VariantMythic', vr: 'VariantEpic',
  r: 'VariantRare', uc: 'VariantUncommon', c: 'VariantUncommon',
};

const RARITY_EMOJI_EXPORT: Record<string, string[]> = {
  c: ['resources_voucher_generic_hero_c'],
  uc: ['esources_voucher_generic_hero_uc'],
  r: ['resources_voucher_generic_hero_r'],
  vr: ['esources_voucher_generic_hero_vr'],
  sr: ['resources_voucher_generic_hero_sr', 'esources_voucher_generic_hero_sr'],
  ssr: ['esources_voucher_generic_hero_er'],
  er: ['esources_voucher_generic_hero_er'],
};

const CLASS_EMOJI_SUFFIX: Record<string, string> = {
  soldat: 'leader_soldier_128',
  ninja: 'leader_ninja_128',
  constructor: 'leader_constructor_128',
  outlander: 'leader_outlander_128',
};

const HERO_POWER: Record<string, Record<number, number>> = {
  c: {
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10,
    11: 10, 12: 11, 13: 12, 14: 13, 15: 14, 16: 16, 17: 17, 18: 18, 19: 19, 20: 20,
    21: 20, 22: 21, 23: 22, 24: 23, 25: 24, 26: 25, 27: 26, 28: 27, 29: 28, 30: 29,
    31: 29, 32: 30, 33: 31, 34: 32, 35: 33, 36: 34, 37: 35, 38: 36, 39: 37, 40: 38,
    41: 38, 42: 39, 43: 40, 44: 41, 45: 42, 46: 43, 47: 44, 48: 45, 49: 46, 50: 47,
  },
  uc: {
    1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11, 8: 13, 9: 14, 10: 15,
    11: 17, 12: 18, 13: 19, 14: 20, 15: 21, 16: 23, 17: 24, 18: 25, 19: 26, 20: 27,
    21: 38, 22: 39, 23: 40, 24: 41, 25: 42, 26: 43, 27: 45, 28: 46, 29: 47, 30: 48,
    31: 67, 32: 68, 33: 70, 34: 71, 35: 72, 36: 74, 37: 75, 38: 77, 39: 78, 40: 80,
    41: 101, 42: 102, 43: 103, 44: 104, 45: 105, 46: 107, 47: 108, 48: 110, 49: 111, 50: 112,
  },
  r: {
    1: 10, 2: 11, 3: 12, 4: 13, 5: 14, 6: 15, 7: 16, 8: 18, 9: 19, 10: 20,
    11: 21, 12: 23, 13: 24, 14: 26, 15: 27, 16: 29, 17: 30, 18: 32, 19: 33, 20: 34,
    21: 43, 22: 44, 23: 46, 24: 48, 25: 49, 26: 50, 27: 51, 28: 53, 29: 54, 30: 55,
    31: 72, 32: 75, 33: 77, 34: 80, 35: 81, 36: 83, 37: 84, 38: 86, 39: 87, 40: 89,
    41: 110, 42: 111, 43: 112, 44: 114, 45: 115, 46: 116, 47: 118, 48: 119, 49: 120, 50: 122,
  },
  vr: {
    1: 9, 2: 11, 3: 12, 4: 14, 5: 15, 6: 17, 7: 18, 8: 20, 9: 21, 10: 22,
    11: 23, 12: 24, 13: 25, 14: 26, 15: 28, 16: 29, 17: 30, 18: 32, 19: 33, 20: 34,
    21: 44, 22: 45, 23: 46, 24: 48, 25: 49, 26: 50, 27: 51, 28: 53, 29: 54, 30: 55,
    31: 72, 32: 75, 33: 77, 34: 80, 35: 81, 36: 83, 37: 84, 38: 86, 39: 87, 40: 89,
    41: 110, 42: 111, 43: 112, 44: 114, 45: 115, 46: 116, 47: 118, 48: 119, 49: 120, 50: 122,
    52: 124, 54: 127, 56: 129, 58: 132, 60: 135,
  },
  sr: {
    1: 12, 2: 14, 3: 15, 4: 17, 5: 18, 6: 20, 7: 21, 8: 23, 9: 24, 10: 26,
    11: 36, 12: 38, 13: 39, 14: 41, 15: 42, 16: 44, 17: 45, 18: 47, 19: 48, 20: 50,
    21: 60, 22: 62, 23: 63, 24: 65, 25: 66, 26: 68, 27: 69, 28: 71, 29: 72, 30: 74,
    31: 84, 32: 86, 33: 87, 34: 89, 35: 90, 36: 92, 37: 93, 38: 95, 39: 96, 40: 98,
    41: 116, 42: 118, 43: 119, 44: 121, 45: 122, 46: 124, 47: 125, 48: 127, 49: 128, 50: 130,
    52: 133, 54: 136, 56: 139, 58: 142, 60: 144,
  },
};

interface HeroInfo {
  displayName: string;
  classLabel: string;
  classEmojiKey: string;
  rarity: string;
}

interface GamePanelLoadout {
  guid: string;
  index: number;
  commanderDisplayName: string;
  commanderTemplateId: string;
  commanderLevel: number;
  heroInfo: HeroInfo;
}

interface PanelStatus {
  style: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description: string;
  rewards?: string;
}

interface PanelAccountContext {
  userId: string;
  userLanguage: SupportedLanguage;
  lang: SupportedLanguage;
  accountId: string;
  accessToken: string;
  displayName: string;
  authorData: AuthorData | null;
}

interface GamePanelProfileData {
  loadouts: GamePanelLoadout[];
  activeLoadoutGuid: string | null;
  activeLoadout: ActiveLoadoutDetails | null;
}

interface ActiveLoadoutHero {
  templateId: string;
  level: number;
  info: HeroInfo;
  portraitPath: string | null;
}

interface ActiveLoadoutDetails {
  index: number;
  totalLoadouts: number;
  commander: ActiveLoadoutHero | null;
  teamHeroes: ActiveLoadoutHero[];
  gadgets: string[];
}

interface PanelRenderResult {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
  files: AttachmentBuilder[];
}

function trimButtonLabel(label: string): string {
  const cleaned = label.replace(/<a?:\w+:\d+>/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.length <= 80 ? cleaned : `${cleaned.slice(0, 77)}...`;
}

function trimEmbedDescription(text: string): string {
  return text.length <= 4096 ? text : `${text.slice(0, 4093)}...`;
}

async function editPanelReply(
  interaction: ChatInputCommandInteraction,
  payload: PanelRenderResult | {
    embed?: EmbedBuilder;
    embeds?: EmbedBuilder[];
    components?: ActionRowBuilder<ButtonBuilder>[];
    files?: AttachmentBuilder[];
  },
): Promise<void> {
  const embeds =
    'embeds' in payload && payload.embeds
      ? payload.embeds
      : 'embed' in payload && payload.embed
        ? [payload.embed]
        : undefined;

  await interaction.editReply({
    embeds,
    components: payload.components ?? [],
    files: payload.files ?? [],
  });
}

function parseHeroInfo(templateId: string, lang: SupportedLanguage): HeroInfo {
  const m = templateId.toLowerCase().match(/^hero:hid_([a-z]+)_(.+?)_(sr|ssr|vr|r|uc|c)_t\d+$/);

  if (!m) {
    const cls = Object.keys(CLASS_MAP).find(key => templateId.toLowerCase().includes(`hid_${key}_`));
    const translated = translateHeroName(templateId, lang);
    const displayName = translated !== templateId
      ? translated
      : templateId.replace(/^Hero:/i, '').replace(/_/g, ' ');

    return {
      displayName,
      classLabel: cls ? CLASS_MAP[cls].label : 'Unknown',
      classEmojiKey: cls ? CLASS_MAP[cls].emojiKey : '',
      rarity: 'r',
    };
  }

  const [, classType, , rarity] = m;
  const cls = CLASS_MAP[classType];
  const translated = translateHeroName(templateId, lang);
  const displayName = translated !== templateId
    ? translated
    : templateId.replace(/^Hero:/i, '').replace(/_/g, ' ');

  return {
    displayName,
    classLabel: cls?.label ?? classType,
    classEmojiKey: cls?.emojiKey ?? '',
    rarity,
  };
}

function getHeroPower(rarity: string, level: number): number {
  const table = HERO_POWER[rarity === 'ssr' ? 'sr' : rarity];
  if (!table) return level;
  if (table[level] !== undefined) return table[level];

  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  let closest = keys[0];
  for (const key of keys) {
    if (key <= level) closest = key;
    else break;
  }
  return table[closest] ?? level;
}

function stwRarityEmoji(rarity: string): string {
  const keys = RARITY_EMOJI_EXPORT[rarity] ?? RARITY_EMOJI_EXPORT.r;
  for (const key of keys) {
    const emoji = e(key);
    if (emoji) return emoji;
  }
  return '';
}

function stwPowerEmoji(): string {
  return e('stw_power') || '';
}

function stwClassEmoji(
  interaction: ChatInputCommandInteraction,
  classEmojiKey: string,
  portraitPath: string | null,
): string {
  if (portraitPath) {
    const fromAsset = eAsset(portraitPath);
    if (fromAsset) return fromAsset;
  }

  if (classEmojiKey) {
    const fromApp = getEmoji(interaction.client, classEmojiKey as any);
    if (fromApp && !fromApp.endsWith(':0>')) return fromApp;

    const suffix = CLASS_EMOJI_SUFFIX[classEmojiKey];
    if (suffix) {
      const fromSuffix = eSuffix(suffix);
      if (fromSuffix) return fromSuffix;
    }
  }

  return '';
}

function resolveHeroPortrait(templateId: string): string | null {
  const m = templateId.toLowerCase().match(/^hero:hid_([a-z]+)_(.+?)_(sr|ssr|vr|r|uc|c)_t\d+$/);
  if (!m) return null;

  const [, classType, middlePart, rarity] = m;
  const cls = CLASS_MAP[classType];
  if (!cls) return null;

  const folder = path.join(HEROES_ROOT, cls.folder, 'Portrait');
  if (!fs.existsSync(folder)) return null;

  let files: string[];
  try { files = fs.readdirSync(folder); } catch { return null; }

  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const noHeadgear = (f: string) => !/headgear/i.test(f);
  const noSmall = (f: string) => !f.endsWith('-L.png');

  const searchKey = norm(`hid-${classType}-${middlePart.replace(/_/g, '-')}-${rarity}`);
  const hidCandidates = files.filter(f => norm(f).includes(searchKey));
  if (hidCandidates.length > 0) {
    return path.join(folder,
      hidCandidates.find(f => noHeadgear(f) && noSmall(f)) ??
      hidCandidates.find(f => noHeadgear(f)) ??
      hidCandidates[0],
    );
  }

  const identifier = middlePart.split('_')[0];
  const identPadded = /^\d+$/.test(identifier) ? identifier.padStart(3, '0') : identifier;
  const identLower = identPadded.toLowerCase();
  const cidCandidates = files.filter(f => {
    const fl = f.toLowerCase();
    return fl.includes(`-${identLower}-`) || fl.includes(`-${identLower}.`);
  });
  if (cidCandidates.length === 0) return null;

  const variant = RARITY_VARIANT[rarity] ?? 'VariantLegendary';
  return path.join(folder,
    cidCandidates.find(f => f.includes(variant) && noHeadgear(f)) ??
    cidCandidates.find(f => noHeadgear(f)) ??
    cidCandidates[0],
  );
}

function resolveGadgetEmoji(templateId: string): string {
  const fromMap = eGadget(templateId);
  if (fromMap) return fromMap;

  const raw = templateId.replace(/^Gadget:/i, '').replace(/^g_/i, '');
  const parts = raw.split('_').filter(Boolean);

  const candidates = new Set<string>([
    raw,
    `${parts.join('_')}_128`,
    parts.length > 1 ? `${parts[0]}_${parts.slice(1).join('')}_128` : '',
    parts.length > 1 ? `${parts.slice(1).join('')}_128` : '',
    parts.length > 1 ? `icon_${parts[0]}_${parts.slice(1).join('')}_128` : '',
  ]);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const exact = e(candidate);
    if (exact) return exact;
    const suffix = eSuffix(candidate);
    if (suffix) return suffix;
  }

  return '';
}

function parseHeroItem(templateId: string, level: number, lang: SupportedLanguage): ActiveLoadoutHero {
  const info = parseHeroInfo(templateId, lang);
  return {
    templateId,
    level,
    info,
    portraitPath: resolveHeroPortrait(templateId),
  };
}

function parseActiveLoadoutDetails(
  items: Record<string, any>,
  activeLoadoutGuid: string | null,
  lang: SupportedLanguage,
  totalLoadouts: number,
): ActiveLoadoutDetails | null {
  if (!activeLoadoutGuid) return null;

  const loadoutItem = items[activeLoadoutGuid];
  if (!loadoutItem?.templateId?.startsWith('CampaignHeroLoadout:')) return null;

  const crewMembers: Record<string, string> = loadoutItem.attributes?.crew_members ?? {};
  const index = (loadoutItem.attributes?.loadout_index ?? 0) + 1;

  const commanderGuid = crewMembers.commanderslot ?? '';
  const commanderItem = commanderGuid ? items[commanderGuid] : null;
  const commander = commanderItem?.templateId
    ? parseHeroItem(commanderItem.templateId, commanderItem.attributes?.level ?? 1, lang)
    : null;

  const teamHeroes: ActiveLoadoutHero[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const guid = crewMembers[`followerslot${i}`] ?? '';
    if (guid && items[guid]?.templateId) {
      teamHeroes.push(parseHeroItem(items[guid].templateId, items[guid].attributes?.level ?? 1, lang));
    }
  }

  const gadgets = ((loadoutItem.attributes?.gadgets as any[]) ?? [])
    .map((entry: any) => entry.gadget as string)
    .filter(Boolean);

  return {
    index,
    totalLoadouts,
    commander,
    teamHeroes,
    gadgets,
  };
}

function formatHeroStatsLine(
  interaction: ChatInputCommandInteraction,
  hero: ActiveLoadoutHero,
  includeName = false,
  options?: { boldName?: boolean },
): string {
  const classEm = stwClassEmoji(interaction, hero.info.classEmojiKey, hero.portraitPath);
  const rarityEm = stwRarityEmoji(hero.info.rarity);
  const power = getHeroPower(hero.info.rarity, hero.level);
  const prefix = [classEm, rarityEm].filter(Boolean).join(' ');
  const boldName = options?.boldName ?? true;

  let line = prefix;
  if (includeName) {
    const name = boldName ? `**${hero.info.displayName}**` : hero.info.displayName;
    line = line ? `${line} ${name}` : name;
  }

  const powerSuffix = ` ${[stwPowerEmoji(), String(power)].filter(Boolean).join(' ')}`;
  return `${line}${powerSuffix}`.trim();
}

function formatCommanderLine(
  interaction: ChatInputCommandInteraction,
  hero: ActiveLoadoutHero,
): string {
  const stats = formatHeroStatsLine(interaction, hero, true, { boldName: false });
  return `# ${stats}`;
}

function formatTeamHeroLine(
  interaction: ChatInputCommandInteraction,
  hero: ActiveLoadoutHero,
): string {
  return epicQuote(formatHeroStatsLine(interaction, hero, true, { boldName: false }));
}

function formatLoadoutButtonLabel(
  interaction: ChatInputCommandInteraction,
  loadout: GamePanelLoadout,
): string {
  const power = getHeroPower(loadout.heroInfo.rarity, loadout.commanderLevel);
  const powerEm = stwPowerEmoji();
  const label = [loadout.commanderDisplayName, powerEm, String(power)].filter(Boolean).join(' ');
  return trimButtonLabel(label);
}

function getLoadoutStatsLine(
  interaction: ChatInputCommandInteraction,
  loadout: GamePanelLoadout,
): string {
  const classEm = stwClassEmoji(interaction, loadout.heroInfo.classEmojiKey, null);
  const rarityEm = stwRarityEmoji(loadout.heroInfo.rarity);
  const powerEm = stwPowerEmoji();
  const power = getHeroPower(loadout.heroInfo.rarity, loadout.commanderLevel);
  return [classEm, rarityEm, powerEm, String(power)].filter(Boolean).join(' ');
}

function formatRewardsText(rewards: Record<string, { cantidad: number; emoji: string }>): string {
  const entries = Object.entries(rewards);
  if (entries.length === 0) return '';

  return entries
    .slice(0, 12)
    .map(([name, reward]) => `${reward.emoji} **${name}** x${reward.cantidad}`)
    .join('\n');
}

async function resolvePanelAccountContext(
  interaction: ChatInputCommandInteraction,
  authorData?: AuthorData | null,
): Promise<PanelAccountContext | null> {
  const userId = interaction.user.id;
  const lang = (await getUserLanguage(userId, interaction.locale)) as SupportedLanguage;
  const user = await UsuarioInfo.findOne({ id: userId });

  if (!user?.deviceAuths?.length) return null;

  const mainAccount = user.deviceAuths.find((account: any) => account.cuentaMain);
  if (!mainAccount) return null;

  const account = mainAccount;

  return {
    userId,
    userLanguage: lang,
    lang,
    accountId: account.accountId,
    accessToken: account.accessToken,
    displayName: account.displayName,
    authorData: authorData ?? await getEpicAuthor(userId, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName,
    }),
  };
}

async function fetchProfileData(
  accountId: string,
  accessToken: string,
  lang: SupportedLanguage,
): Promise<GamePanelProfileData> {
  const result = await callCore<GamePanelProfileResult>('gamepanel.profile', {
    accountId,
    accessToken,
  });

  const items = result.items ?? {};
  const activeLoadoutGuid = result.activeLoadoutGuid ?? null;

  const loadouts = Object.entries<any>(items)
    .filter(([, item]) => item.templateId?.startsWith('CampaignHeroLoadout:'))
    .sort((a, b) => (a[1].attributes?.loadout_index ?? 0) - (b[1].attributes?.loadout_index ?? 0))
    .map(([guid, item]) => {
      const index = (item.attributes?.loadout_index ?? 0) + 1;
      const commanderGuid: string = item.attributes?.crew_members?.commanderslot ?? '';
      const commanderItem = commanderGuid ? items[commanderGuid] : null;
      const commanderTemplateId: string = commanderItem?.templateId ?? '';
      const heroInfo = parseHeroInfo(commanderTemplateId, lang);

      return {
        guid,
        index,
        commanderDisplayName: commanderTemplateId ? heroInfo.displayName : `Loadout ${index}`,
        commanderTemplateId,
        commanderLevel: commanderItem?.attributes?.level ?? 1,
        heroInfo,
      } satisfies GamePanelLoadout;
    });

  return {
    loadouts,
    activeLoadoutGuid,
    activeLoadout: parseActiveLoadoutDetails(items, activeLoadoutGuid, lang, loadouts.length),
  };
}

async function setActiveHeroLoadout(
  accountId: string,
  accessToken: string,
  loadoutGUID: string,
): Promise<void> {
  await callCore('gamepanel.setLoadout', {
    accountId,
    accessToken,
    displayName: '',
    loadoutGuid: loadoutGUID,
  });
}

async function fetchPartyState(context: PanelAccountContext): Promise<PartyState> {
  const party = await callCore<PartyState | null>('party.state', {
    accountId: context.accountId,
    accessToken: context.accessToken,
    displayName: context.displayName,
  });

  if (!party) throw new Error('Party not found');
  return party;
}

function buildKickRow(
  sessionPrefix: string,
  labels: {
    leave: string;
    kickCollect: string;
    kickAllCollect: string;
    claimRewards: string;
  },
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${sessionPrefix}:leave`)
      .setLabel(labels.leave)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${sessionPrefix}:kick_collect`)
      .setLabel(labels.kickCollect)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${sessionPrefix}:kick_all_collect`)
      .setLabel(labels.kickAllCollect)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${sessionPrefix}:claim_rewards`)
      .setLabel(labels.claimRewards)
      .setStyle(ButtonStyle.Success),
  );
}

function buildLoadoutRows(
  interaction: ChatInputCommandInteraction,
  sessionPrefix: string,
  loadouts: GamePanelLoadout[],
  activeLoadoutGuid: string | null,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const visibleLoadouts = loadouts.slice(0, MAX_LOADOUT_BUTTONS);

  for (let i = 0; i < visibleLoadouts.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();

    for (const loadout of visibleLoadouts.slice(i, i + 5)) {
      const isActive = loadout.guid === activeLoadoutGuid;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${sessionPrefix}:loadout:${loadout.guid}`)
          .setLabel(formatLoadoutButtonLabel(interaction, loadout))
          .setStyle(isActive ? ButtonStyle.Secondary : ButtonStyle.Success),
      );
    }

    rows.push(row);
  }

  return rows;
}

async function buildPanelRender(
  interaction: ChatInputCommandInteraction,
  context: PanelAccountContext,
  profileData: GamePanelProfileData,
  sessionPrefix: string,
  status?: PanelStatus,
): Promise<PanelRenderResult> {
  const files: AttachmentBuilder[] = [];
  const active = profileData.activeLoadout;
  const commander = active?.commander ?? null;

  let thumbnailURL: string | undefined;
  if (commander?.portraitPath && fs.existsSync(commander.portraitPath)) {
    files.push(new AttachmentBuilder(commander.portraitPath, { name: 'gamepanel_commander.png' }));
    thumbnailURL = 'attachment://gamepanel_commander.png';
  }

  const descriptionParts: string[] = [];

  if (status) {
    const statusText = status.description + (status.rewards ? `\n\n${status.rewards}` : '');
    descriptionParts.push(statusText.length <= 900 ? statusText : `${statusText.slice(0, 897)}...`);
    descriptionParts.push('');
  }

  if (commander) {
    descriptionParts.push(formatCommanderLine(interaction, commander));
  } else {
    descriptionParts.push(
      `*${await translateForUser(context.userId, 'gamepanel.fields.noActiveLoadout', undefined, interaction.locale)}*`,
    );
  }

  if (active?.teamHeroes.length) {
    descriptionParts.push('');
    descriptionParts.push(
      epicSection(await translateForUser(context.userId, 'gamepanel.embed.heroesLabel', undefined, interaction.locale)),
    );
    for (const hero of active.teamHeroes) {
      descriptionParts.push(formatTeamHeroLine(interaction, hero));
    }
  }

  if (active?.gadgets.length) {
    const gadgetEmojis = active.gadgets
      .map(templateId => resolveGadgetEmoji(templateId))
      .filter(Boolean);
    if (gadgetEmojis.length > 0) {
      descriptionParts.push('');
      descriptionParts.push(
        epicSection(await translateForUser(context.userId, 'gamepanel.embed.gadgetsLabel', undefined, interaction.locale)),
      );
      descriptionParts.push(gadgetEmojis.join(' '));
    }
  }

  const footerText = active
    ? await translateForUser(context.userId, 'gamepanel.embed.loadoutFooter', {
        current: String(active.index),
        total: String(active.totalLoadouts),
      }, interaction.locale)
    : undefined;

  const embed = await buildEpicEmbed(
    context.userId,
    {
      style: status?.style ?? 'info',
      description: trimEmbedDescription(descriptionParts.join('\n')),
      author: context.authorData,
      footerText,
      footerKey: footerText ? 'none' : 'brand',
    },
    interaction,
    interaction.locale,
  );

  if (thumbnailURL) {
    embed.setThumbnail(thumbnailURL);
  }

  const kickLabels = {
    leave: await translateForUser(context.userId, 'party.panel.buttons.leave', undefined, interaction.locale),
    kickCollect: await translateForUser(context.userId, 'party.panel.buttons.kickCollect', undefined, interaction.locale),
    kickAllCollect: await translateForUser(context.userId, 'party.panel.buttons.kickAllCollect', undefined, interaction.locale),
    claimRewards: await translateForUser(context.userId, 'party.panel.buttons.claimRewards', undefined, interaction.locale),
  };

  const components = [
    ...buildLoadoutRows(interaction, sessionPrefix, profileData.loadouts, profileData.activeLoadoutGuid),
    buildKickRow(sessionPrefix, kickLabels),
  ];

  return { embed, components, files };
}

async function renderPanel(
  interaction: ChatInputCommandInteraction,
  context: PanelAccountContext,
  sessionPrefix: string,
  status?: PanelStatus,
): Promise<boolean> {
  try {
    const profileData = await fetchProfileData(context.accountId, context.accessToken, context.lang);

    if (profileData.loadouts.length === 0) {
      const embed = await buildEpicEmbed(
        context.userId,
        {
          style: 'error',
          title: await translateEpic(interaction.client, context.userId, 'gamepanel.errors.noLoadouts.title', 'error', undefined, interaction.locale),
          description: await translateForUser(context.userId, 'gamepanel.errors.noLoadouts.description', undefined, interaction.locale),
          author: context.authorData,
          footerKey: 'brand',
        },
        interaction,
        interaction.locale,
      );
      await editPanelReply(interaction, { embeds: [embed], components: [] });
      return false;
    }

    const panel = await buildPanelRender(interaction, context, profileData, sessionPrefix, status);
    await editPanelReply(interaction, panel);
    return true;
  } catch (error: unknown) {
    const err = error as { message?: string; code?: unknown };
    logger.warn({
      userId: context.userId,
      code: err.code,
      error: err.message ?? String(error),
    }, '[gamepanel] renderPanel failed');

    try {
      const embed = await buildEpicEmbed(
        context.userId,
        {
          style: 'error',
          title: await translateEpic(interaction.client, context.userId, 'gamepanel.errors.unexpected.title', 'error', undefined, interaction.locale),
          description: await translateForUser(context.userId, 'gamepanel.errors.unexpected.description', undefined, interaction.locale),
          author: context.authorData,
          footerKey: 'brand',
        },
        interaction,
        interaction.locale,
      );
      await editPanelReply(interaction, { embeds: [embed], components: [] });
    } catch {
      // Ignore secondary edit failures (expired interaction, DM closed, etc.)
    }
    return false;
  }
}

export async function handleGamePanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const initialContext = await resolvePanelAccountContext(interaction);

  if (!initialContext) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return;
  }

  const sessionPrefix = `gamepanel:${interaction.id}`;

  await replyWithEpicEmbed(interaction, userId, {
    loading: true,
    title: await translateEpic(interaction.client, userId, 'gamepanel.embed.loadingTitle', 'loading', undefined, interaction.locale),
    description: await translateForUser(userId, 'gamepanel.embed.loadingDescription', undefined, interaction.locale),
    author: initialContext.authorData,
    footerKey: 'brand',
  });

  const message = await interaction.fetchReply() as Message;
  const active = await renderPanel(interaction, initialContext, sessionPrefix);
  if (!active) return;

  let closed = false;
  const collector = message.createMessageComponentCollector({ idle: EPIC_PANEL_IDLE_MS });

  collector.on('collect', async (componentInteraction) => {
    if (!componentInteraction.customId.startsWith(sessionPrefix)) return;

    if (componentInteraction.user.id !== interaction.user.id) {
      await componentInteraction.reply({
        content: await translateForUser(userId, 'gamepanel.errors.notYourPanel', undefined, interaction.locale),
        ephemeral: true,
      }).catch(() => null);
      return;
    }

    await componentInteraction.deferUpdate().catch(() => null);

    const context = await resolvePanelAccountContext(interaction, initialContext.authorData);
    if (!context) {
      closed = true;
      collector.stop('closed');
      return;
    }

    try {
      const actionParts = componentInteraction.customId.slice(sessionPrefix.length + 1).split(':');
      const action = actionParts[0];

      if (action === 'loadout') {
        const loadoutGuid = actionParts.slice(1).join(':');
        let profileData = await fetchProfileData(context.accountId, context.accessToken, context.lang);
        const selectedLoadout = profileData.loadouts.find(loadout => loadout.guid === loadoutGuid);

        if (!selectedLoadout) {
          await renderPanel(interaction, context, sessionPrefix, {
            style: 'warning',
            title: await translateEpic(interaction.client, context.userId, 'hero.errors.notFound', 'warning', undefined, interaction.locale),
            description: await translateForUser(context.userId, 'hero.errors.notFound', undefined, interaction.locale),
          });
          return;
        }

        try {
          await setActiveHeroLoadout(context.accountId, context.accessToken, loadoutGuid);
        } catch (error: unknown) {
          const err = error as { message?: string };
          logger.warn({ userId: context.userId, loadoutGuid, error: err.message }, '[gamepanel] SetActiveHeroLoadout failed');
          await renderPanel(interaction, context, sessionPrefix, {
            style: 'error',
            title: await translateEpic(interaction.client, context.userId, 'loadout.set.error', 'error', undefined, interaction.locale),
            description: await translateForUser(context.userId, 'loadout.set.error', undefined, interaction.locale),
          });
          return;
        }

        profileData = await fetchProfileData(context.accountId, context.accessToken, context.lang);
        await renderPanel(interaction, context, sessionPrefix, {
          style: 'success',
          title: await translateEpic(interaction.client, context.userId, 'gamepanel.status.loadoutSet.title', 'success', undefined, interaction.locale),
          description: await translateForUser(context.userId, 'gamepanel.status.loadoutSet.description', {
            loadout: `#${selectedLoadout.index} ${selectedLoadout.commanderDisplayName}`,
            stats: getLoadoutStatsLine(interaction, selectedLoadout),
          }, interaction.locale),
        });
        return;
      }

      if (action === 'leave') {
        await callCore('party.leave', {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
        });

        closed = true;
        collector.stop('completed');

        const embed = await buildEpicEmbed(
          context.userId,
          {
            style: 'success',
            title: await translateEpic(interaction.client, context.userId, 'party.kick.normal.embed.success.title', 'success', undefined, interaction.locale),
            description: await translateForUser(context.userId, 'party.kick.normal.embed.success.description', {
              displayName: context.displayName,
            }, interaction.locale),
            author: context.authorData,
            footerKey: 'brand',
          },
          interaction,
          interaction.locale,
        );

        await editPanelReply(interaction, { embeds: [embed], components: [] });
        return;
      }

      if (action === 'kick_collect') {
        const rewards = await callCoreWithTimeout<RewardsMap>('party.claimRewards', 10 * 60_000, {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
          language: context.userLanguage,
        });
        const rewardLines = formatRewardsText(rewards);
        await callCore('party.leave', {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
        });

        closed = true;
        collector.stop('completed');

        const hasRewards = Object.keys(rewards).length > 0;
        const rewardKey = hasRewards ? 'successWithRewards' : 'noRewards';
        const embed = await buildEpicEmbed(
          context.userId,
          {
            style: 'success',
            title: await translateEpic(interaction.client, context.userId, `party.kick.collect.embed.${rewardKey}.title`, 'success', undefined, interaction.locale),
            description: await translateForUser(context.userId, `party.kick.collect.embed.${rewardKey}.description`, {
              displayName: context.displayName,
            }, interaction.locale),
            fields: rewardLines
              ? [{
                  name: await translateForUser(context.userId, 'party.kick.collect.fields.rewards', undefined, interaction.locale),
                  value: rewardLines,
                  inline: false,
                }]
              : undefined,
            author: context.authorData,
            footerKey: 'brand',
          },
          interaction,
          interaction.locale,
        );

        await editPanelReply(interaction, { embeds: [embed], components: [] });
        return;
      }

      if (action === 'kick_all_collect') {
        const kickResult = await callCoreWithTimeout<KickMembersResult>('party.kickMembers', 5 * 60_000, {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
        });
        const isLeader = kickResult.isLeader;
        const kickedCount = kickResult.kickedCount;
        const kickedNames = kickResult.kickedNames;

        const rewards = await callCoreWithTimeout<RewardsMap>('party.claimRewards', 10 * 60_000, {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
          language: context.userLanguage,
        });
        await callCore('party.leave', {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
        });

        closed = true;
        collector.stop('completed');

        const hasRewards = Object.keys(rewards).length > 0;
        const rewardKey = hasRewards ? 'successWithRewards' : 'noRewards';
        const fields = [{
          name: await translateForUser(context.userId, 'party.kick.collectall.fields.membersKicked', undefined, interaction.locale),
          value: isLeader
            ? await translateForUser(context.userId, 'party.kick.collectall.fields.kickedCount', { count: kickedCount }, interaction.locale)
            : await translateForUser(context.userId, 'party.kick.collectall.fields.notLeader', undefined, interaction.locale),
          inline: false,
        }];

        if (kickedNames.length > 0) {
          fields.push({
            name: await translateForUser(context.userId, 'party.panel.fields.kickedMembers', undefined, interaction.locale),
            value: kickedNames.join('\n'),
            inline: false,
          });
        }

        const rewardLines = formatRewardsText(rewards);
        if (rewardLines) {
          fields.push({
            name: await translateForUser(context.userId, 'party.kick.collect.fields.rewards', undefined, interaction.locale),
            value: rewardLines,
            inline: false,
          });
        }

        const embed = await buildEpicEmbed(
          context.userId,
          {
            style: 'success',
            title: await translateEpic(interaction.client, context.userId, `party.kick.collect.embed.${rewardKey}.title`, 'success', undefined, interaction.locale),
            description: await translateForUser(context.userId, `party.kick.collect.embed.${rewardKey}.description`, {
              displayName: context.displayName,
            }, interaction.locale),
            fields,
            author: context.authorData,
            footerKey: 'brand',
          },
          interaction,
          interaction.locale,
        );

        await editPanelReply(interaction, { embeds: [embed], components: [] });
        return;
      }

      if (action === 'claim_rewards') {
        const rewards = await callCoreWithTimeout<RewardsMap>('party.claimRewards', 10 * 60_000, {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
          language: context.userLanguage,
        });

        const hasRewards = Object.keys(rewards).length > 0;
        await renderPanel(interaction, context, sessionPrefix, {
          style: hasRewards ? 'success' : 'warning',
          title: hasRewards
            ? await translateEpic(interaction.client, context.userId, 'party.panel.status.claimedRewards.title', 'success', undefined, interaction.locale)
            : await translateEpic(interaction.client, context.userId, 'party.panel.status.noRewards.title', 'warning', undefined, interaction.locale),
          description: await translateForUser(
            context.userId,
            hasRewards ? 'party.panel.status.claimedRewards.description' : 'party.panel.status.noRewards.description',
            undefined,
            interaction.locale,
          ),
          rewards: hasRewards ? formatRewardsText(rewards) : undefined,
        });
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      if (err.message === 'Party not found' && componentInteraction.customId.includes(':leave')) {
        await renderPanel(interaction, context, sessionPrefix, {
          style: 'warning',
          title: await translateEpic(interaction.client, context.userId, 'party.kick.normal.embed.noParty.title', 'warning', undefined, interaction.locale),
          description: await translateForUser(context.userId, 'party.kick.normal.embed.noParty.description', {
            displayName: context.displayName,
          }, interaction.locale),
        });
        return;
      }

      logger.warn({
        userId: context.userId,
        customId: componentInteraction.customId,
        error: err.message,
      }, '[gamepanel] collector action failed');
      await renderPanel(interaction, context, sessionPrefix, {
        style: 'error',
        title: await translateEpic(interaction.client, context.userId, 'gamepanel.errors.unexpected.title', 'error', undefined, interaction.locale),
        description: await translateForUser(context.userId, 'gamepanel.errors.unexpected.description', undefined, interaction.locale),
      });
    }
  });

  collector.on('end', async (_, reason) => {
    if (closed) return;
    if (!isCollectorIdle(reason)) return;

    try {
      const inactiveText = await translateForUser(userId, 'epic.inactivePanel', undefined, interaction.locale);
      await editReplyInactive(interaction, inactiveText);
    } catch {
      await editPanelReply(interaction, { components: [] }).catch(() => null);
    }
  });
}
