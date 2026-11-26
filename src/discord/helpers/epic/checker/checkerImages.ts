import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import { fetchCampaignDefenders } from '../stw/collection/stwCampaignDefenders.ts';
import { fetchCampaignHeroes } from '../stw/collection/stwCampaignHeroes.ts';
import { fetchCampaignSchematics, type CampaignSchematicItem } from '../stw/collection/stwCampaignSchematics.ts';
import { fetchCampaignSurvivors } from '../stw/collection/stwCampaignSurvivors.ts';
import { fetchStwInventoryItems } from '../stw/inventory/stwInventoryData.ts';
import {
  type CheckerImageConfig,
  type CheckerImageKey,
  isCheckerImageEnabled,
} from './checkerImageConfig.ts';
import { generateLockerImage } from '#managers/images/br/locker/lockerImageManager.ts';
import {
  isExclusiveCosmeticId,
  parseLockerCosmeticsFromProfile,
} from '#managers/images/br/locker/lockerProfileParser.ts';
import type { LockerCosmeticTypeFilter } from '#managers/images/br/locker/types.ts';
import {
  filterCosmeticIds,
  type LockerFilters,
} from '#managers/images/br/locker/cosmeticFilters.ts';
import type { CampaignHeroItem } from '../stw/collection/stwCampaignHeroes.ts';
import type { CampaignDefenderItem } from '../stw/collection/stwCampaignDefenders.ts';
import type { CampaignSurvivorItem } from '../stw/collection/stwCampaignSurvivors.ts';
import { filterCampaignHeroesMulti, type HeroClassMenuValue } from '../stw/inventory/stwHeroFilters.ts';
import { filterCampaignDefendersMulti, type DefenderTypeMenuValue } from '../stw/inventory/stwDefenderFilters.ts';
import { filterCampaignSurvivorsMulti, type SurvivorTypeMenuValue } from '../stw/inventory/stwSurvivorFilters.ts';
import {
  filterSchematicItemsMulti,
  type SchematicRarityMenuValue,
  type SchematicTypeMenuValue,
} from '../stw/inventory/stwSchematicFilters.ts';
import type { StwRarityMenuValue } from '../stw/inventory/stwRarityFilters.ts';
import { generateStwCollectionCardsImage } from '#managers/images/stw/campaign/stwCardsImageManager.ts';
import { generateStwResourcesImage } from '#managers/images/stw/resources/resourcesImageManager.ts';
import { generateStwInventoryImage } from '#managers/images/stw/theater/inventoryImageManager.ts';
import {
  type StwImageBrandingOptions,
  resolveImageDisplayName,
} from '#managers/images/stw/stwImageBranding.ts';
import { log } from '#helpers/core/logger.ts';
import type { CheckerAdvancedSettings } from '#services/checkerProfileCache.ts';

export interface CheckerImageBuffer {
  buffer: Buffer;
  fileName: string;
}

export interface CheckerImageResult {
  key: CheckerImageKey;
  label: string;
  buffers: CheckerImageBuffer[];
}

interface LockerJob {
  key: CheckerImageKey;
  label: string;
  types: LockerCosmeticTypeFilter[];
  exclusive?: boolean;
  fileSlug: string;
}

const LOCKER_JOBS: LockerJob[] = [
  { key: 'locker_outfit', label: 'Skins', types: ['outfit'], fileSlug: 'outfit' },
  { key: 'locker_backpack', label: 'Back Blings', types: ['backpack'], fileSlug: 'backpack' },
  { key: 'locker_pickaxe', label: 'Pickaxes', types: ['pickaxe'], fileSlug: 'pickaxe' },
  { key: 'locker_glider', label: 'Gliders', types: ['glider'], fileSlug: 'glider' },
  { key: 'locker_emote', label: 'Emotes', types: ['emote'], fileSlug: 'emote' },
  {
    key: 'locker_exclusive',
    label: 'Exclusives',
    types: ['all'],
    exclusive: true,
    fileSlug: 'exclusives',
  },
];

export interface GenerateCheckerImagesInput {
  config: CheckerImageConfig;
  lang: SupportedLanguage;
  accessToken: string;
  accountId: string;
  displayName: string;
  discordUserId: string;
  athenaProfileBody: unknown;
  campaignProfile: Record<string, unknown>;
  campaignProfileBody: unknown;
  theaterProfileBody: unknown | null;
  outpostProfile: Record<string, unknown> | null;
  outpostProfileBody: unknown | null;
  imageBranding?: StwImageBrandingOptions;
  advancedSettings?: CheckerAdvancedSettings;
}

type CheckerImageRuntimeContext = GenerateCheckerImagesInput & {
  displayName: string;
  branding: StwImageBrandingOptions;
};

function mapHeroFilterTypes(types: string[]): HeroClassMenuValue[] {
  return types.map((t) => (t === 'soldier' ? 'commando' : t)) as HeroClassMenuValue[];
}

async function resolveLockerAllowedIdsForJob(
  job: LockerJob,
  ctx: CheckerImageRuntimeContext,
): Promise<ReadonlySet<string> | undefined> {
  if (job.exclusive) {
    const raw = parseLockerCosmeticsFromProfile(ctx.athenaProfileBody, ['all']);
    const ids = raw
      .filter((item) => isExclusiveCosmeticId(item.id))
      .map((item) => item.id.toLowerCase());
    if (!ids.length) return new Set();
    return new Set(ids);
  }

  const lf = ctx.advancedSettings?.lockerFilters;
  const filters: LockerFilters = {
    types: job.types as string[],
    rarities: lf?.rarities ?? ['all'],
    chapters: lf?.chapters ?? ['all'],
    exclusive: lf?.exclusive ?? false,
  };

  const hasRarity = !filters.rarities.includes('all');
  const hasChapter = !filters.chapters.includes('all');
  const hasExclusive = filters.exclusive;
  if (!hasRarity && !hasChapter && !hasExclusive) return undefined;

  const raw = parseLockerCosmeticsFromProfile(ctx.athenaProfileBody, job.types);
  let ids = raw.map((item) => item.id);
  if (hasExclusive) ids = ids.filter((id) => isExclusiveCosmeticId(id));
  if (hasRarity || hasChapter) {
    ids = await filterCosmeticIds(ids, { ...filters, exclusive: false });
  }
  if (!ids.length) return new Set();
  return new Set(ids.map((id) => id.toLowerCase()));
}

function filterStwCardItems(
  collection: 'heroes' | 'survivors' | 'defenders' | 'schematics',
  items: Array<{ itemId: string }>,
  ctx: CheckerImageRuntimeContext,
): Array<{ itemId: string }> {
  const filters = ctx.advancedSettings?.stwFilters?.[collection];
  if (!filters) return items;

  switch (collection) {
    case 'heroes':
      return filterCampaignHeroesMulti(items as CampaignHeroItem[], {
        types: mapHeroFilterTypes(filters.types),
        rarities: filters.rarities as StwRarityMenuValue[],
      });
    case 'survivors':
      return filterCampaignSurvivorsMulti(items as CampaignSurvivorItem[], {
        types: filters.types as SurvivorTypeMenuValue[],
        rarities: filters.rarities as StwRarityMenuValue[],
      });
    case 'defenders':
      return filterCampaignDefendersMulti(items as CampaignDefenderItem[], {
        types: filters.types as DefenderTypeMenuValue[],
        rarities: filters.rarities as StwRarityMenuValue[],
      });
    case 'schematics':
      return filterSchematicItemsMulti(items as CampaignSchematicItem[], {
        types: filters.types as SchematicTypeMenuValue[],
        rarities: filters.rarities as SchematicRarityMenuValue[],
      });
    default:
      return items;
  }
}

async function generateLockerJob(
  job: LockerJob,
  ctx: CheckerImageRuntimeContext,
): Promise<CheckerImageResult | null> {
  try {
    const allowedIds = await resolveLockerAllowedIdsForJob(job, ctx);
    if (allowedIds && allowedIds.size === 0) return null;

    const result = await generateLockerImage({
      profileBody: ctx.athenaProfileBody,
      lang: ctx.lang,
      types: job.types,
      displayName: ctx.displayName,
      accountId: ctx.accountId,
      exclusiveOnly: job.exclusive ?? false,
      allowedIds,
      siteUrl: ctx.branding.siteUrl,
      footerIconUrl: ctx.branding.footerIconUrl,
    });

    const baseName = result.fileName?.replace(/\.webp$/i, '') ?? 'locker';
    const fileName = job.fileSlug === 'outfit' && !job.exclusive
      ? result.fileName
      : `locker-${job.fileSlug}.webp`;

    return {
      key: job.key,
      label: job.label,
      buffers: [{
        buffer: result.buffer,
        fileName: fileName.includes('.') ? fileName : `${baseName}.webp`,
      }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.commands.debug(
      { key: job.key, accountId: ctx.accountId, error: message },
      'Checker locker image skipped',
    );
    return null;
  }
}

export async function generateCheckerImages(
  ctx: GenerateCheckerImagesInput,
): Promise<CheckerImageResult[]> {
  const branding: StwImageBrandingOptions = {
    ...ctx.imageBranding,
    ...ctx.advancedSettings?.branding,
    maskDisplayName: true,
  };
  const displayName = resolveImageDisplayName(ctx.displayName, branding);
  const imageCtx: CheckerImageRuntimeContext = { ...ctx, displayName, branding };

  const results: CheckerImageResult[] = [];
  const tasks: Promise<CheckerImageResult | null>[] = [];

  for (const job of LOCKER_JOBS) {
    if (!isCheckerImageEnabled(ctx.config, job.key)) continue;
    tasks.push(generateLockerJob(job, imageCtx));
  }

  if (isCheckerImageEnabled(ctx.config, 'stw_resources')) {
    tasks.push((async () => {
      try {
        const { buffer, fileName } = await generateStwResourcesImage({
          campaignProfile: ctx.campaignProfile,
          outpostProfile: ctx.outpostProfile,
          accessToken: ctx.accessToken,
          accountId: ctx.accountId,
          displayName: imageCtx.displayName,
          branding: imageCtx.branding,
          discordUserId: ctx.discordUserId,
          athenaProfileBody: ctx.athenaProfileBody,
        });
        return {
          key: 'stw_resources' as const,
          label: 'STW Resources',
          buffers: [{ buffer, fileName }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.commands.debug({ accountId: ctx.accountId, error: message }, 'Checker STW resources skipped');
        return null;
      }
    })());
  }

  if (isCheckerImageEnabled(ctx.config, 'stw_backpack') && ctx.theaterProfileBody) {
    tasks.push((async () => {
      try {
        const items = await fetchStwInventoryItems(
          ctx.accountId,
          ctx.accessToken,
          'campaign',
          ctx.lang,
          ctx.theaterProfileBody,
        );
        if (!items.length) return null;
        const { pages } = await generateStwInventoryImage({
          items,
          source: 'campaign',
          lang: ctx.lang,
          displayName: imageCtx.displayName,
          accountId: ctx.accountId,
          accessToken: ctx.accessToken,
          discordUserId: ctx.discordUserId,
          branding: imageCtx.branding,
        });
        return {
          key: 'stw_backpack' as const,
          label: 'STW Backpack',
          buffers: pages.map((page, index) => ({
            buffer: page.buffer,
            fileName: pages.length === 1 ? 'stw-backpack.webp' : `stw-backpack-${index + 1}.webp`,
          })),
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.commands.debug({ accountId: ctx.accountId, error: message }, 'Checker STW backpack skipped');
        return null;
      }
    })());
  }

  if (isCheckerImageEnabled(ctx.config, 'stw_storage') && ctx.outpostProfileBody) {
    tasks.push((async () => {
      try {
        const items = await fetchStwInventoryItems(
          ctx.accountId,
          ctx.accessToken,
          'storage',
          ctx.lang,
          ctx.outpostProfileBody,
        );
        if (!items.length) return null;
        const { pages } = await generateStwInventoryImage({
          items,
          source: 'storage',
          lang: ctx.lang,
          displayName: imageCtx.displayName,
          accountId: ctx.accountId,
          accessToken: ctx.accessToken,
          discordUserId: ctx.discordUserId,
          branding: imageCtx.branding,
        });
        return {
          key: 'stw_storage' as const,
          label: 'STW Storage',
          buffers: pages.map((page, index) => ({
            buffer: page.buffer,
            fileName: pages.length === 1 ? 'stw-storage.webp' : `stw-storage-${index + 1}.webp`,
          })),
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.commands.debug({ accountId: ctx.accountId, error: message }, 'Checker STW storage skipped');
        return null;
      }
    })());
  }

  const cardJobs: {
    key: CheckerImageKey;
    label: string;
    type: 'heroes' | 'survivors' | 'defenders' | 'schematics';
    fetch: () => Promise<{ itemId: string }[]>;
  }[] = [
    {
      key: 'stw_heroes',
      label: 'STW Heroes',
      type: 'heroes',
      fetch: () => fetchCampaignHeroes(ctx.accountId, ctx.accessToken, ctx.campaignProfileBody),
    },
    {
      key: 'stw_survivors',
      label: 'STW Survivors',
      type: 'survivors',
      fetch: () => fetchCampaignSurvivors(ctx.accountId, ctx.accessToken, ctx.campaignProfileBody),
    },
    {
      key: 'stw_defenders',
      label: 'STW Defenders',
      type: 'defenders',
      fetch: () => fetchCampaignDefenders(ctx.accountId, ctx.accessToken, ctx.campaignProfileBody),
    },
    {
      key: 'stw_schematics',
      label: 'STW Schematics',
      type: 'schematics',
      fetch: () => fetchCampaignSchematics(ctx.accountId, ctx.accessToken, ctx.campaignProfileBody),
    },
  ];

  for (const job of cardJobs) {
    if (!isCheckerImageEnabled(ctx.config, job.key)) continue;
    tasks.push((async () => {
      try {
        let items = await job.fetch();
        items = filterStwCardItems(job.type, items, imageCtx);
        if (!items.length) return null;
        const { buffer, fileName } = await generateStwCollectionCardsImage({
          type: job.type,
          items,
          accountId: ctx.accountId,
          accessToken: ctx.accessToken,
          displayName: imageCtx.displayName,
          profileBody: ctx.campaignProfileBody,
          discordUserId: ctx.discordUserId,
          branding: imageCtx.branding,
        });
        return {
          key: job.key,
          label: job.label,
          buffers: [{ buffer, fileName }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.commands.debug({ key: job.key, accountId: ctx.accountId, error: message }, 'Checker STW cards skipped');
        return null;
      }
    })());
  }

  const settled = await Promise.all(tasks);
  for (const result of settled) {
    if (result) results.push(result);
  }
  return results;
}

export async function generateSingleCheckerImage(
  key: CheckerImageKey,
  ctx: GenerateCheckerImagesInput,
): Promise<CheckerImageResult | null> {
  const singleConfig = Object.fromEntries(
    (Object.keys(ctx.config) as CheckerImageKey[]).map((k) => [k, k === key]),
  ) as CheckerImageConfig;
  const results = await generateCheckerImages({ ...ctx, config: singleConfig });
  return results.find((r) => r.key === key) ?? results[0] ?? null;
}
