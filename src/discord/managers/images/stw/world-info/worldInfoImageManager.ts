import {
  CATEGORIES,
  type ProcessedMission,
  type ZoneMissions,
} from '#helpers/epic/stw/alerts/alertsHelper.ts';
import { translateAlertsZone } from '#helpers/epic/stw/alerts/alertsDisplayTranslations.ts';
import {
  CATEGORY_SECTION_META,
  WORLD_INFO_MAX_MISSIONS_PER_IMAGE,
  WORLD_INFO_MAX_OVERVIEW_IMAGES,
  ZONE_SECTION_META,
} from './worldInfoConstants.ts';
import { mapProcessedMissionsToRows } from './worldInfoMapper.ts';
import { renderWorldInfoSectionImage } from './worldInfoRenderer.ts';
import {
  resolveSectionIconPath,
} from './worldInfoAssetResolver.ts';
import type {
  GenerateStwWorldInfoViewImagesOptions,
  WorldInfoSectionImageResult,
  WorldInfoSectionInput,
} from './types.ts';

export const STW_WORLD_INFO_FILE_BASE = 'stw-alerts';

function chunkMissions<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function renderSectionChunks(
  input: Omit<WorldInfoSectionInput, 'missions'> & { missions: ProcessedMission[] },
  lang: GenerateStwWorldInfoViewImagesOptions['lang'],
  pageSuffix = '',
): Promise<WorldInfoSectionImageResult[]> {
  const chunks = chunkMissions(input.missions, WORLD_INFO_MAX_MISSIONS_PER_IMAGE);
  if (chunks.length === 0) {
    const empty = await renderWorldInfoSectionImage({
      ...input,
      missions: [],
    }, `${STW_WORLD_INFO_FILE_BASE}${pageSuffix}`);
    return [empty];
  }

  const results: WorldInfoSectionImageResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const suffix = chunks.length > 1 ? `${pageSuffix}-${i + 1}` : pageSuffix;
    const rendered = await renderWorldInfoSectionImage({
      ...input,
      title: chunks.length > 1 ? `${input.title} · ${i + 1}/${chunks.length}` : input.title,
      missions: mapProcessedMissionsToRows(chunks[i], lang),
    }, `${STW_WORLD_INFO_FILE_BASE}${suffix}`);
    results.push(rendered);
  }
  return results;
}

function categoryMeta(categoryId: string): {
  title: string;
  color: string;
  sectionIconPath: string | null;
} {
  const cat = CATEGORIES.find((entry) => entry.id === categoryId);
  const meta = CATEGORY_SECTION_META[categoryId];
  const iconResourceId = meta?.iconResourceId;
  const sectionIconPath = iconResourceId
    ? resolveSectionIconPath(
      iconResourceId === 'red-skull'
        ? { difficultyKey: 'red-skull' }
        : { resourceId: iconResourceId },
    )
    : null;

  return {
    title: cat?.title ?? categoryId,
    color: meta?.color ?? '#3b82f6',
    sectionIconPath,
  };
}

function zoneMeta(zoneName: string): {
  title: string;
  color: string;
  sectionIconPath: string | null;
} {
  const meta = ZONE_SECTION_META[zoneName];
  const sectionIconPath = meta
    ? resolveSectionIconPath({
      resourceId: meta.resourceId,
      difficultyKey: meta.difficultyKey,
      worldId: meta.worldId,
    })
    : null;

  return {
    title: zoneName,
    color: meta?.color ?? '#3b82f6',
    sectionIconPath,
  };
}

export async function generateStwWorldInfoSectionImage(
  input: WorldInfoSectionInput,
): Promise<WorldInfoSectionImageResult> {
  return renderWorldInfoSectionImage(input, STW_WORLD_INFO_FILE_BASE);
}

async function renderOverviewCategoryImages(
  zones: ZoneMissions[],
  options: GenerateStwWorldInfoViewImagesOptions,
): Promise<WorldInfoSectionImageResult[]> {
  const allMissions = zones.flatMap((zone) => zone.missions);
  const results: WorldInfoSectionImageResult[] = [];

  for (const cat of CATEGORIES) {
    if (results.length >= WORLD_INFO_MAX_OVERVIEW_IMAGES) break;

    const matches = allMissions.filter(cat.filter);
    if (!matches.length) continue;

    const priority = [
      ...matches.filter((m) => m.hasAlerts),
      ...matches.filter((m) => !m.hasAlerts),
    ];
    const meta = categoryMeta(cat.id);
    const title = options.categoryTitles?.[cat.id] ?? meta.title;
    const chunks = await renderSectionChunks({
      title,
      color: meta.color,
      sectionIconPath: meta.sectionIconPath,
      missions: priority,
      branding: options.branding,
    }, options.lang, `-overview-${cat.id}`);

    if (chunks[0]) results.push(chunks[0]);
  }

  return results;
}

export async function generateStwWorldInfoViewImages(
  options: GenerateStwWorldInfoViewImagesOptions,
): Promise<WorldInfoSectionImageResult[]> {
  const { zones, state, branding, lang } = options;
  const missionsPerPage = options.missionsPerPage ?? 6;

  if (state.view === 'overview') {
    if (state.expandedCat) {
      const allMissions = zones.flatMap((zone) => zone.missions);
      const cat = CATEGORIES.find((entry) => entry.id === state.expandedCat);
      if (!cat) return [];
      const matches = allMissions.filter(cat.filter);
      const priority = [...matches.filter((m) => m.hasAlerts), ...matches.filter((m) => !m.hasAlerts)];
      const meta = categoryMeta(cat.id);
      const title = options.categoryTitles?.[cat.id] ?? meta.title;
      return renderSectionChunks({
        title,
        color: meta.color,
        sectionIconPath: meta.sectionIconPath,
        missions: priority,
        branding,
      }, lang, `-${cat.id}`);
    }

    return renderOverviewCategoryImages(zones, options);
  }

  const zoneData = zones.find((zone) => zone.zone === state.view);
  if (!zoneData) return [];

  const totalPages = Math.max(1, Math.ceil(zoneData.missions.length / missionsPerPage));
  const safePage = Math.min(state.page, totalPages - 1);
  const start = safePage * missionsPerPage;
  const pageMissions = zoneData.missions.slice(start, start + missionsPerPage);
  const meta = zoneMeta(zoneData.zone);
  const zoneTitle = options.zoneTitles?.[zoneData.zone] ?? translateAlertsZone(zoneData.zone, lang);
  const pageSuffix = totalPages > 1 ? `-${slugZone(zoneData.zone)}-p${safePage + 1}` : `-${slugZone(zoneData.zone)}`;

  return renderSectionChunks({
    title: totalPages > 1 ? `${zoneTitle} · ${safePage + 1}/${totalPages}` : zoneTitle,
    color: meta.color,
    sectionIconPath: meta.sectionIconPath,
    missions: pageMissions,
    branding,
  }, lang, pageSuffix);
}

function slugZone(zone: string): string {
  return zone.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export type { ZoneMissions, ProcessedMission };
