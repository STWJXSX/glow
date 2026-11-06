/**
 * Athena profile parsing for /profile xp.
 */

export interface AthenaItem {
  templateId?: string;
  attributes?: Record<string, unknown>;
}

export interface PassLevels {
  lego: number | null;
  musical: number | null;
  origins: number | null;
  battle: number | null;
}

export interface WeeklyXp {
  reload: number;
  reloadMax: number;
  creative: number;
  creativeMax: number;
  stw: number | null;
  stwMax: number;
}
export const SEASON_LEVEL_XP = 80_000;

export interface SeasonXpInfo {
  seasonNum: number;
  seasonLevel: number;
  bookLevel: number;
  /** XP remaining to reach the next battle pass level. */
  bookXpRemaining: number;
  /** XP remaining to reach the next season level. */
  seasonXpRemaining: number;
}

export interface XpBoostInfo {
  restedXp: number;
  restedMultiplier: number;
  restedXpConsumed: number;
  personalBoost: number;
  friendBoost: number;
  comboBoost: number;
}

export interface WeeklyXpCaps {
  reloadMax: number;
  creativeMax: number;
  reloadMaxFromProfile: boolean;
  creativeMaxFromProfile: boolean;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getItemLevel(item: AthenaItem): number | null {
  const attrs = item.attributes;
  if (!attrs) return null;

  for (const key of ['book_level', 'level']) {
    const value = attrs[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }

  return null;
}

function extractSeasonFromTemplate(templateId: string): number | null {
  const patterns = [
    /athenaseason(\d+)/i,
    /sparks_season(\d+)/i,
    /figmentpass_s(\d+)/i,
    /figmentpass(\d+)/i,
    /s(\d+)pass_seasonasset/i,
    /season(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = templateId.match(pattern);
    if (match?.[1]) {
      const season = parseInt(match[1], 10);
      if (season > 0) return season;
    }
  }

  return null;
}

function isLegoPassTemplate(templateId: string): boolean {
  return /AthenaSeason:s\d+pass_seasonasset$/i.test(templateId);
}

function isMusicalPassTemplate(templateId: string): boolean {
  return templateId.includes('AthenaSeason:sparks_season');
}

function isOriginsPassTemplate(templateId: string): boolean {
  return templateId.includes('AthenaSeason:figmentpass');
}

function isBattlePassTemplate(templateId: string): boolean {
  return /^AthenaSeason:athenaseason\d+$/i.test(templateId);
}

function findPassLevel(
  items: Record<string, AthenaItem>,
  matcher: (templateId: string) => boolean,
  currentSeason: number,
): number | null {
  let currentSeasonLevel: number | null = null;
  let bestSeason = -1;
  let bestLevel: number | null = null;

  for (const item of Object.values(items)) {
    const templateId = item?.templateId;
    if (typeof templateId !== 'string' || !matcher(templateId)) continue;

    const level = getItemLevel(item);
    if (level === null) continue;

    const season = extractSeasonFromTemplate(templateId) ?? currentSeason;
    if (season === currentSeason) {
      currentSeasonLevel = currentSeasonLevel === null ? level : Math.max(currentSeasonLevel, level);
      continue;
    }

    if (season > bestSeason) {
      bestSeason = season;
      bestLevel = level;
    } else if (season === bestSeason && (bestLevel === null || level > bestLevel)) {
      bestLevel = level;
    }
  }

  return currentSeasonLevel ?? bestLevel;
}

function findPassLevelFromPastPasses(
  pastPasses: unknown[],
  matcher: (templateId: string) => boolean,
  currentSeason: number,
): number | null {
  let currentSeasonLevel: number | null = null;
  let bestSeason = -1;
  let bestLevel: number | null = null;

  for (const entry of pastPasses) {
    if (!entry || typeof entry !== 'object') continue;
    const pass = entry as Record<string, unknown>;
    const templateId = pass.seasonTemplateId;
    if (typeof templateId !== 'string' || !matcher(templateId)) continue;

    const level =
      typeof pass.book_level === 'number'
        ? pass.book_level
        : typeof pass.level === 'number'
          ? pass.level
          : null;
    if (level === null) continue;

    const season = extractSeasonFromTemplate(templateId) ?? num(pass.seasonNumber);
    if (season === currentSeason) {
      currentSeasonLevel = currentSeasonLevel === null ? level : Math.max(currentSeasonLevel, level);
      continue;
    }

    if (season > bestSeason) {
      bestSeason = season;
      bestLevel = level;
    } else if (season === bestSeason && (bestLevel === null || level > bestLevel)) {
      bestLevel = level;
    }
  }

  return currentSeasonLevel ?? bestLevel;
}

export function resolvePassLevels(
  attrs: Record<string, unknown>,
  items: Record<string, AthenaItem>,
): PassLevels {
  const currentSeason = num(attrs.season_num);
  const pastPasses = Array.isArray(attrs.past_season_passes) ? attrs.past_season_passes : [];

  let lego = findPassLevel(items, isLegoPassTemplate, currentSeason);
  let musical = findPassLevel(items, isMusicalPassTemplate, currentSeason);
  let origins = findPassLevel(items, isOriginsPassTemplate, currentSeason);

  const bookLevel = num(attrs.book_level);
  let battle: number | null = bookLevel > 0 ? bookLevel : null;
  if (battle === null) {
    battle = findPassLevel(items, isBattlePassTemplate, currentSeason);
  }

  if (lego === null) {
    lego = findPassLevelFromPastPasses(pastPasses, isLegoPassTemplate, currentSeason);
  }
  if (musical === null) {
    musical = findPassLevelFromPastPasses(pastPasses, isMusicalPassTemplate, currentSeason);
  }
  if (origins === null) {
    origins = findPassLevelFromPastPasses(pastPasses, isOriginsPassTemplate, currentSeason);
  }
  if (battle === null) {
    battle = findPassLevelFromPastPasses(pastPasses, isBattlePassTemplate, currentSeason);
  }

  return { lego, musical, origins, battle };
}

const DEFAULT_RELOAD_WEEKLY_CAP = 4_000_000;
const DEFAULT_CREATIVE_WEEKLY_CAP = 4_000_000;
const DEFAULT_STW_WEEKLY_CAP = 3_400_000;

function readWeeklyCap(
  source: { maxWeekXp?: number } | undefined,
  fallback: number,
): { cap: number; fromProfile: boolean } {
  if (typeof source?.maxWeekXp === 'number' && Number.isFinite(source.maxWeekXp) && source.maxWeekXp > 0) {
    return { cap: source.maxWeekXp, fromProfile: true };
  }
  return { cap: fallback, fromProfile: false };
}

export function resolveWeeklyXpCaps(attrs: Record<string, unknown>): WeeklyXpCaps {
  const playtimeXp = attrs.playtime_xp as { maxWeekXp?: number } | undefined;
  const creativeXp = attrs.creative_dynamic_xp as { maxWeekXp?: number } | undefined;
  const reload = readWeeklyCap(playtimeXp, DEFAULT_RELOAD_WEEKLY_CAP);
  const creative = readWeeklyCap(creativeXp, DEFAULT_CREATIVE_WEEKLY_CAP);

  return {
    reloadMax: reload.cap,
    creativeMax: creative.cap,
    reloadMaxFromProfile: reload.fromProfile,
    creativeMaxFromProfile: creative.fromProfile,
  };
}

export function resolveWeeklyXp(attrs: Record<string, unknown>, stwData: StwWeeklyXpData): WeeklyXp {
  const playtimeXp = attrs.playtime_xp as { currentWeekXp?: number; maxWeekXp?: number } | undefined;
  const creativeXp = attrs.creative_dynamic_xp as { currentWeekXp?: number; maxWeekXp?: number } | undefined;
  const caps = resolveWeeklyXpCaps(attrs);

  return {
    reload: num(playtimeXp?.currentWeekXp),
    reloadMax: caps.reloadMax,
    creative: num(creativeXp?.currentWeekXp),
    creativeMax: caps.creativeMax,
    stw: stwData.weeklyXp,
    stwMax: stwData.weeklyMax,
  };
}

export function xpRemainingForNextLevel(
  currentLevelXp: number,
  perLevel: number = SEASON_LEVEL_XP,
): number {
  const progress = ((currentLevelXp % perLevel) + perLevel) % perLevel;
  return Math.max(0, perLevel - progress);
}

export function resolveSeasonXpInfo(attrs: Record<string, unknown>): SeasonXpInfo {
  const bookXp = num(attrs.book_xp);
  const seasonXp = num(attrs.xp);

  return {
    seasonNum: num(attrs.season_num),
    seasonLevel: num(attrs.level),
    bookLevel: num(attrs.book_level),
    bookXpRemaining: xpRemainingForNextLevel(bookXp),
    seasonXpRemaining: xpRemainingForNextLevel(seasonXp),
  };
}

function readBoostCount(item: AthenaItem | undefined): number {
  if (!item) return 0;

  const attrs = item.attributes;
  if (!attrs) return 1;

  for (const key of ['level', 'num_granted_boost', 'boost_level', 'count', 'quantity']) {
    const value = attrs[key];
    if (typeof value === 'number' && value > 0) return value;
  }

  return 1;
}

export function resolveXpBoosts(
  attrs: Record<string, unknown>,
  items: Record<string, AthenaItem>,
): XpBoostInfo {
  let personalBoost = 0;
  let friendBoost = 0;
  let comboBoost = 0;

  for (const item of Object.values(items)) {
    const templateId = item?.templateId;
    if (templateId === 'Token:athenaseasonxpboost') {
      personalBoost = Math.max(personalBoost, readBoostCount(item));
    } else if (templateId === 'Token:athenaseasonfriendxpboost') {
      friendBoost = Math.max(friendBoost, readBoostCount(item));
    } else if (templateId === 'Token:athenaseasonmergedxpboosts') {
      comboBoost = Math.max(comboBoost, readBoostCount(item));
    }
  }

  return {
    restedXp: num(attrs.rested_xp),
    restedMultiplier: num(attrs.rested_xp_mult),
    restedXpConsumed: num(attrs.rested_xp_consumed_cumulative),
    personalBoost,
    friendBoost,
    comboBoost,
  };
}

export function formatAthenaDatetime(
  value: unknown,
  notAvailable: string,
  unknownLabel: string,
): string {
  if (typeof value !== 'string' || value.length === 0) return notAvailable;

  const timestamp = Math.floor(new Date(value).getTime() / 1000);
  if (!Number.isFinite(timestamp)) return unknownLabel;

  return `<t:${timestamp}:F> (<t:${timestamp}:R>)`;
}

export function formatXpProgress(current: number, max: number, emoji: string): string {
  const percent = max > 0 ? ((current / max) * 100).toFixed(2) : '0.00';
  return `${emoji} ${current.toLocaleString()}/${max.toLocaleString()} (${percent}%)`;
}

export function formatLevelValue(level: number | null, notAvailable: string): string {
  return level === null ? notAvailable : String(level);
}

export interface StwWeeklyXpData {
  weeklyXp: number | null;
  weeklyMax: number;
}

function readNumericAttribute(attrs: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!attrs) return null;
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function extractMcpProfile(mcpResult: unknown): Record<string, unknown> | null {
  const root = mcpResult as {
    profileChanges?: Array<{ profile?: Record<string, unknown> }>;
    data?: { profileChanges?: Array<{ profile?: Record<string, unknown> }> };
  };

  const changes = root.profileChanges ?? root.data?.profileChanges;
  const profile = changes?.[0]?.profile;
  return profile && typeof profile === 'object' ? profile : null;
}

export function readStwWeeklyXpFromCampaignProfile(profile: Record<string, unknown>): StwWeeklyXpData {
  const items = (profile.items ?? {}) as Record<string, AthenaItem>;
  let weeklyMax = DEFAULT_STW_WEEKLY_CAP;

  for (const item of Object.values(items)) {
    const templateId = item?.templateId;
    if (templateId !== 'Token:stw_accolade_tracker' && !templateId?.endsWith(':stw_accolade_tracker')) {
      continue;
    }

    const attrs = item.attributes ?? {};
    const weeklyXp = readNumericAttribute(attrs, ['weekly_xp', 'weeklyXp', 'week_xp']);
    const cap = readNumericAttribute(attrs, ['weekly_xp_cap', 'maxWeekXp', 'weekly_cap']);
    if (cap !== null && cap > 0) weeklyMax = cap;

    return {
      weeklyXp: weeklyXp ?? 0,
      weeklyMax,
    };
  }

  return { weeklyXp: null, weeklyMax };
}

export async function fetchStwWeeklyXp(
  composeMcp: (opts: {
    operation: string;
    profile: string;
    accountId: string;
    accessToken: string;
    logError?: boolean;
  }) => Promise<unknown>,
  accountId: string,
  accessToken: string,
): Promise<StwWeeklyXpData> {
  const unavailable: StwWeeklyXpData = { weeklyXp: null, weeklyMax: DEFAULT_STW_WEEKLY_CAP };

  try {
    const campaign = await composeMcp({
      operation: 'QueryProfile',
      profile: 'campaign',
      accountId,
      accessToken,
      logError: false,
    });

    const profile = extractMcpProfile(campaign);
    if (!profile) return unavailable;

    return readStwWeeklyXpFromCampaignProfile(profile);
  } catch {
    return unavailable;
  }
}
