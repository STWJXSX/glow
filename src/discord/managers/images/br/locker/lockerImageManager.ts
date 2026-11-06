import { prepareBrandIcon } from '#managers/images/stw/campaign/stwCardBranding.ts';
import { buildBrandingContext, formatBrandingDate } from '#managers/images/stw/campaign/stwCardBranding.ts';
import { resolveStwSiteLabel } from '#managers/images/stw/stwImageBranding.ts';
import { loadLockerFooterLogoRaw } from './lockerBranding.ts';
import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import { getRarityWeight, LOCKER_TILE_GAP, LOCKER_TILE_SIZE, TYPE_ORDER } from './lockerConstants.ts';
import { loadFortniteCosmeticCatalog, mapRawToDisplay } from './lockerCosmeticApi.ts';
import { enrichRawLockerCosmetics, filterRawLockerByTypes } from './lockerCosmeticResolve.ts';
import { resolveHeaderCategoryIcon } from './lockerCategoryAssets.ts';
import { formatLockerFooterDate } from './lockerLabels.ts';
import { resolveLockerGridCols } from './lockerGridLayout.ts';
import { isExclusiveCosmeticId, parseLockerCosmeticsFromProfile } from './lockerProfileParser.ts';
import { clearLockerRenderCaches, renderLockerPageToBuffer, resolveLockerOutputFileName } from './lockerSharpGrid.ts';
import { isLockerPerfEnabled, LockerPerf } from './lockerPerf.ts';
import type {
  GenerateLockerImageOptions,
  GenerateLockerImageResult,
  LockerCosmeticType,
  LockerCosmeticTypeFilter,
  LockerDisplayCosmetic,
  LockerPageResult,
} from './types.ts';
import { createLockerPageScratch } from './types.ts';

import { prepareAccountAvatar } from '#managers/images/stw/campaign/stwCardBranding.ts';

export const LOCKER_IMAGE_FILE_NAME = 'locker.webp';

function sortDisplayItems(items: LockerDisplayCosmetic[]): LockerDisplayCosmetic[] {
  return [...items].sort((a, b) => {
    // 1. Favorites FIRST!
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    // 2. Type order
    const typeA = TYPE_ORDER.indexOf(a.type);
    const typeB = TYPE_ORDER.indexOf(b.type);
    if (typeA !== typeB) return typeA - typeB;
    // 3. Exclusive
    if (a.isExclusive && !b.isExclusive) return -1;
    if (!a.isExclusive && b.isExclusive) return 1;
    // 4. Rarity weight
    const w = getRarityWeight(b.themeKey) - getRarityWeight(a.themeKey);
    if (w !== 0) return w;
    // 5. Date added
    const da = a.added ? new Date(a.added).getTime() : 0;
    const db = b.added ? new Date(b.added).getTime() : 0;
    if (da !== db) return db - da;
    // 6. Name
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
}

function resolveCategoryType(
  types: LockerCosmeticTypeFilter[],
  explicit?: LockerCosmeticType,
): LockerCosmeticType {
  if (explicit) return explicit;
  if (types.length === 1 && types[0] !== 'all') return types[0];
  return 'outfit';
}

export async function generateLockerImage(
  options: GenerateLockerImageOptions,
): Promise<GenerateLockerImageResult> {
  const {
    profileBody,
    lang,
    types = ['outfit'],
    displayName,
    accountId,
    accessToken,
    discordUserId,
    categoryType: categoryTypeArg,
    exclusiveOnly = false,
    allowedIds,
    siteUrl,
    footerIconUrl,
  } = options;

  const perf = isLockerPerfEnabled() ? new LockerPerf('generateLockerImage') : null;

  const catalog = await loadFortniteCosmeticCatalog(lang);
  perf?.lap('loadCatalog');

  const rawParsed = parseLockerCosmeticsFromProfile(profileBody, types).filter(
    (item) => !allowedIds || allowedIds.has(item.id.toLowerCase()),
  );
  const raw = filterRawLockerByTypes(enrichRawLockerCosmetics(rawParsed, catalog), types);
  perf?.lap('parseProfile');
  if (!raw.length) throw new Error('No locker cosmetics in profile');

  const display: LockerDisplayCosmetic[] = [];

  for (const item of raw) {
    const isExclusive = isExclusiveCosmeticId(item.id);
    const mapped = mapRawToDisplay(item, catalog, isExclusive);
    if (!mapped) continue;
    display.push({
      id: item.id,
      name: mapped.name,
      type: item.type,
      themeKey: mapped.themeKey,
      iconUrl: mapped.iconUrl,
      isExclusive,
      isFavorite: mapped.isFavorite,
      added: mapped.added,
    });
  }

  if (!display.length) throw new Error('No displayable locker cosmetics');
  perf?.lap('mapCatalog');

  const sorted = sortDisplayItems(display);
  perf?.lap('sortItems');
  const categoryType = resolveCategoryType(types, categoryTypeArg);
  const headerIconKey = resolveHeaderCategoryIcon(types, exclusiveOnly, categoryTypeArg);
  const exclusiveCount = sorted.filter((i) => i.isExclusive).length;

  const branding = displayName
    ? {
      displayName,
      accountId: accountId ?? 'preview',
      dateLabel: formatLockerFooterDate(new Date()),
      siteUrl: resolveStwSiteLabel(siteUrl),
    }
    : null;

  const [brandIconPng, accountAvatarPng] = await Promise.all([
    branding
      ? (footerIconUrl
        ? await prepareBrandIcon(40, footerIconUrl)
        : await loadLockerFooterLogoRaw())
      : Promise.resolve(null),
    accessToken && accountId
      ? prepareAccountAvatar(accessToken, accountId, 112, discordUserId).catch(() => null)
      : Promise.resolve(null),
  ]);
  perf?.lap('brandingAssets');
  const gridCols = resolveLockerGridCols(sorted.length, categoryType);

  try {
    const pageStart = performance.now();
    const pagePerf = isLockerPerfEnabled()
      ? new LockerPerf(`renderPage (${sorted.length} items)`)
      : null;
    const scratch = createLockerPageScratch();
    const buffer = await renderLockerPageToBuffer({
      items: sorted,
      gridCols,
      tileSize: LOCKER_TILE_SIZE,
      tileGap: LOCKER_TILE_GAP,
      categoryType,
      headerIconKey,
      lang,
      branding,
      brandIconPng,
      accountAvatarPng,
      tileConcurrency: 48,
      perf: pagePerf,
      scratch,
    });
    const fileName = resolveLockerOutputFileName(buffer);
    pagePerf?.flush();
    perf?.record('renderPage', performance.now() - pageStart);

    perf?.flush();

    const pages: LockerPageResult[] = [{
      buffer,
      itemCount: sorted.length,
      pageIndex: 0,
      pageCount: 1,
      gridCols,
    }];

    return {
      buffer,
      pages,
      itemCount: sorted.length,
      exclusiveCount,
      fileName,
      gridCols,
    };
  } finally {
    clearLockerRenderCaches();
  }
}

export async function generateLockerPanelResult(ctx: {
  profileBody: unknown;
  lang: SupportedLanguage;
  types?: LockerCosmeticTypeFilter[];
  header: { displayName: string };
  account: { accountId: string };
  categoryType?: LockerCosmeticType;
}): Promise<{
  buffer: Buffer;
  fileName: string;
  totalCount: number;
  exclusiveCount: number;
}> {
  const result = await generateLockerImage({
    profileBody: ctx.profileBody,
    lang: ctx.lang,
    types: ctx.types,
    displayName: ctx.header.displayName,
    accountId: ctx.account.accountId,
    categoryType: ctx.categoryType,
  });
  return {
    buffer: result.buffer,
    fileName: result.fileName,
    totalCount: result.itemCount,
    exclusiveCount: result.exclusiveCount,
  };
}

// Re-export branding helper for bot wiring later
export { buildBrandingContext, formatBrandingDate };
