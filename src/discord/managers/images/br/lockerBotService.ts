import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import {
  filterCosmeticIds,
  type LockerFilters,
} from './locker/cosmeticFilters.ts';
import {
  generateLockerImage,
  isExclusiveCosmeticId,
  LOCKER_IMAGE_FILE_NAME,
  loadFortniteCosmeticCatalog,
  parseLockerCosmeticsFromProfile,
} from './locker/index.ts';
import { enrichRawLockerCosmetics, filterRawLockerByTypes } from './locker/lockerCosmeticResolve.ts';
import type { LockerCosmeticTypeFilter, RawLockerCosmetic } from './locker/types.ts';
import { log } from '#helpers/core/logger.ts';
export { LOCKER_IMAGE_FILE_NAME };

export interface LockerBotGenerateResult {
  success: boolean;
  buffer?: Buffer;
  buffers?: Buffer[];
  fileName?: string;
  count?: number;
  exclusiveCount?: number;
  pageCount?: number;
  timeSec?: string;
  error?: string;
}

export async function fetchAthenaProfile(
  accountId: string,
  accessToken: string,
): Promise<unknown> {
  const profileData = await composeMCP({
    profile: 'athena',
    operation: 'QueryProfile',
    body: {},
    accountId,
    accessToken,
  });
  return profileData;
}

export async function countLockerCosmetics(
  accountId: string,
  accessToken: string,
  cosmeticTypes: string | string[],
): Promise<number> {
  try {
    const types = (Array.isArray(cosmeticTypes) ? cosmeticTypes : [cosmeticTypes]) as LockerCosmeticTypeFilter[];
    const profile = await fetchAthenaProfile(accountId, accessToken);
    const catalog = await loadFortniteCosmeticCatalog('en');
    const raw = filterRawLockerByTypes(
      enrichRawLockerCosmetics(parseLockerCosmeticsFromProfile(profile, types), catalog),
      types,
    );
    return raw.length;
  } catch {
    return 0;
  }
}

async function resolveAllowedIds(
  raw: RawLockerCosmetic[],
  filters: LockerFilters,
): Promise<ReadonlySet<string> | undefined> {
  const hasRarityFilter = !filters.rarities.includes('all');
  const hasChapterFilter = !filters.chapters.includes('all');
  const hasExclusiveFilter = filters.exclusive;

  if (!hasRarityFilter && !hasChapterFilter && !hasExclusiveFilter) {
    return undefined;
  }

  let ids = raw.map((item) => item.id);

  if (hasExclusiveFilter) {
    ids = ids.filter((id) => isExclusiveCosmeticId(id));
  }

  if (hasRarityFilter || hasChapterFilter) {
    ids = await filterCosmeticIds(ids, { ...filters, exclusive: false });
  }

  return new Set(ids.map((id) => id.toLowerCase()));
}

export async function generateLockerForAccount(params: {
  accountId: string;
  accessToken: string;
  displayName: string;
  lang: SupportedLanguage;
  filters: LockerFilters;
  discordUserId?: string;
}): Promise<LockerBotGenerateResult> {
  const start = performance.now();
  const types = params.filters.types as LockerCosmeticTypeFilter[];

  try {
    const profileBody = await fetchAthenaProfile(params.accountId, params.accessToken);
    const raw = parseLockerCosmeticsFromProfile(profileBody, types);
    if (!raw.length) {
      return { success: false, error: 'No se encontraron cosméticos' };
    }

    const allowedIds = await resolveAllowedIds(raw, params.filters);

    if (allowedIds && allowedIds.size === 0) {
      return { success: false, error: 'No cosmetics match the filters' };
    }

    const result = await generateLockerImage({
      profileBody,
      lang: params.lang,
      types,
      displayName: params.displayName,
      accountId: params.accountId,
      accessToken: params.accessToken,
      discordUserId: params.discordUserId,
      allowedIds,
      exclusiveOnly: params.filters.exclusive,
    });

    const timeSec = ((performance.now() - start) / 1000).toFixed(2);
    return {
      success: true,
      buffer: result.buffer,
      buffers: result.pages.map((page) => page.buffer),
      fileName: result.fileName || LOCKER_IMAGE_FILE_NAME,
      count: result.itemCount,
      exclusiveCount: result.exclusiveCount,
      pageCount: result.pages.length,
      timeSec,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    log.commands.error(
      { error: message, stack, accountId: params.accountId, types },
      'Locker image generation failed',
    );
    if (message.includes('No displayable') || message.includes('No locker')) {
      return { success: false, error: 'No cosmetics match the filters' };
    }
    return { success: false, error: message };
  }
}
