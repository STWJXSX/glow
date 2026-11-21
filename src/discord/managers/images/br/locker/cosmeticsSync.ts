import fs from 'fs';
import path from 'path';

import axios from 'axios';
import sharp from 'sharp';

import { log } from '#helpers/core/logger.ts';
import { FORTNITE_API_LANGUAGES, type FortniteApiLanguage } from '#helpers/locales/languages.ts';

import { mapConcurrent } from './lockerConcurrency.ts';
import {
  COSMETIC_SECTIONS,
  COSMETICS_ASSETS_DIR,
  COSMETICS_CATALOG_DIR,
  COSMETICS_IMAGES_DIR,
  COSMETICS_INDEX_FILE,
  COSMETICS_MANIFEST_FILE,
  COSMETICS_META_DIR,
  FORTNITE_COSMETICS_NEW_URL,
  FORTNITE_COSMETICS_URL,
  type CosmeticSection,
} from './cosmeticsConstants.ts';
import {
  collectCosmeticImageRefs,
  pickPortraitVariant,
} from './cosmeticsImageUtils.ts';
import {
  buildManifestItemPaths,
  clearLocalCatalogCache,
  type CosmeticsIndexLegacy,
  type CosmeticsManifestV2,
} from './cosmeticsLocalCatalog.ts';

export {
  COSMETIC_SECTIONS,
  COSMETICS_ASSETS_DIR,
  COSMETICS_INDEX_FILE,
  COSMETICS_SYNC_CRON_UTC,
} from './cosmeticsConstants.ts';

export {
  loadCosmeticsIndex,
  loadCosmeticsManifest,
  resolveCosmeticPortraitPath,
  isLocalCatalogAvailable,
  loadLocalCosmeticCatalog,
  resolveCosmeticImageByTemplateId,
  resolveCosmeticShopImagePath,
  toLocalCosmeticUrl,
  clearLocalCatalogCache,
} from './cosmeticsLocalCatalog.ts';

export { pickPortraitVariant, pickShopVariant, collectCosmeticImageRefs } from './cosmeticsImageUtils.ts';

/** @deprecated use pickPortraitVariant via cosmeticsImageUtils */
export function pickLockerPortraitUrl(images: Record<string, unknown> | null | undefined): string | null {
  if (!images) return null;
  const refs = collectCosmeticImageRefs({ images }, 'br');
  return pickPortraitVariant(refs, 'br');
}

export interface CosmeticsSyncOptions {
  force?: boolean;
  sections?: CosmeticSection[];
  concurrency?: number;
  languages?: readonly FortniteApiLanguage[];
  skipJson?: boolean;
  skipImages?: boolean;
}

export interface CosmeticsSyncResult {
  success: boolean;
  downloaded: number;
  skipped: number;
  failed: number;
  noImage: number;
  jsonFiles: number;
  imageVariants: number;
  manifestPath: string;
  durationMs: number;
  error?: string;
}

type ImageWork = {
  section: CosmeticSection;
  id: string;
  variant: string;
  url: string;
};

let syncInFlight: Promise<CosmeticsSyncResult> | null = null;

const DEFAULT_CONCURRENCY = 32;
const WEBP_MAX_EDGE = 512;
const WEBP_QUALITY = 85;

function imageVariantPath(section: CosmeticSection, id: string, variant: string): string {
  return path.join(COSMETICS_IMAGES_DIR, section, id.toLowerCase(), `${variant}.webp`);
}

function legacyPortraitPath(section: CosmeticSection, id: string): string {
  return path.join(COSMETICS_ASSETS_DIR, section, `${id.toLowerCase()}.webp`);
}

async function fetchAggregateCatalog(language: FortniteApiLanguage): Promise<Partial<Record<CosmeticSection, Record<string, unknown>[]>>> {
  const response = await axios.get(FORTNITE_COSMETICS_URL, {
    params: { language },
    timeout: 180_000,
    validateStatus: (status) => status < 500,
  });

  if (response.status !== 200 || response.data?.status !== 200) {
    throw new Error(`fortnite-api cosmetics/${language} status ${response.status}`);
  }

  return response.data?.data ?? {};
}

async function fetchNewMetadata(language: FortniteApiLanguage): Promise<unknown> {
  const response = await axios.get(FORTNITE_COSMETICS_NEW_URL, {
    params: { language },
    timeout: 60_000,
    validateStatus: (status) => status < 500,
  });

  if (response.status !== 200 || response.data?.status !== 200) {
    throw new Error(`fortnite-api cosmetics/new/${language} status ${response.status}`);
  }

  return response.data?.data ?? null;
}

async function downloadImageWebp(imageUrl: string, destPath: string): Promise<void> {
  const response = await axios.get(imageUrl, {
    timeout: 25_000,
    responseType: 'arraybuffer',
    maxRedirects: 3,
    validateStatus: (status) => status === 200,
  });

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  await sharp(Buffer.from(response.data), { limitInputPixels: 32_000_000 })
    .resize(WEBP_MAX_EDGE, WEBP_MAX_EDGE, { fit: 'inside', withoutEnlargement: false })
    .webp({ quality: WEBP_QUALITY, effort: 4, smartSubsample: true })
    .toFile(destPath);
}

function buildImageWorkList(
  sections: CosmeticSection[],
  catalog: Partial<Record<CosmeticSection, Record<string, unknown>[]>>,
): { work: ImageWork[]; noImage: number; catalogCounts: Partial<Record<CosmeticSection, number>> } {
  const work: ImageWork[] = [];
  const slotSeen = new Set<string>();
  let noImage = 0;
  const catalogCounts: Partial<Record<CosmeticSection, number>> = {};

  for (const section of sections) {
    const rows = catalog[section] ?? [];
    catalogCounts[section] = rows.length;

    for (const item of rows) {
      if (!item?.id) continue;
      const id = String(item.id);
      const refs = collectCosmeticImageRefs(item, section);

      if (!refs.length) {
        noImage++;
        continue;
      }

      for (const ref of refs) {
        const slot = `${section}/${id.toLowerCase()}/${ref.variant}`;
        if (slotSeen.has(slot)) continue;
        slotSeen.add(slot);
        work.push({ section, id, variant: ref.variant, url: ref.url });
      }
    }
  }

  return { work, noImage, catalogCounts };
}

function writeManifestAndLegacyIndex(
  manifestItems: Record<string, import('./cosmeticsLocalCatalog.ts').CosmeticsManifestItem>,
  catalogCounts: Partial<Record<CosmeticSection, number>>,
  languages: readonly FortniteApiLanguage[],
  imageVariantCount: number,
): { manifestPath: string; legacyPath: string } {
  const manifestPath = path.join(COSMETICS_ASSETS_DIR, COSMETICS_MANIFEST_FILE);
  const legacyPath = path.join(COSMETICS_ASSETS_DIR, COSMETICS_INDEX_FILE);

  const manifest: CosmeticsManifestV2 = {
    v: 2,
    at: new Date().toISOString(),
    catalogLanguages: [...languages],
    sections: [...COSMETIC_SECTIONS],
    stats: {
      catalogItems: catalogCounts,
      imageFiles: imageVariantCount,
      imageVariants: imageVariantCount,
    },
    items: manifestItems,
  };

  const legacy: CosmeticsIndexLegacy = {
    v: 1,
    at: manifest.at,
    n: Object.keys(manifestItems).length,
    items: Object.fromEntries(
      Object.entries(manifestItems).map(([id, row]) => [id, row.section]),
    ),
  };

  fs.mkdirSync(COSMETICS_ASSETS_DIR, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
  fs.writeFileSync(legacyPath, JSON.stringify(legacy), 'utf8');

  return { manifestPath, legacyPath };
}

async function runCosmeticsSync(options: CosmeticsSyncOptions = {}): Promise<CosmeticsSyncResult> {
  const started = Date.now();
  const sections = options.sections ?? [...COSMETIC_SECTIONS];
  const languages = options.languages ?? FORTNITE_API_LANGUAGES;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const force = Boolean(options.force);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let noImage = 0;
  let jsonFiles = 0;

  const manifestItems: CosmeticsManifestV2['items'] = {};

  try {
    fs.mkdirSync(COSMETICS_ASSETS_DIR, { recursive: true });
    fs.mkdirSync(COSMETICS_CATALOG_DIR, { recursive: true });
    fs.mkdirSync(COSMETICS_META_DIR, { recursive: true });
    fs.mkdirSync(COSMETICS_IMAGES_DIR, { recursive: true });

    for (const section of sections) {
      fs.mkdirSync(path.join(COSMETICS_ASSETS_DIR, section), { recursive: true });
      fs.mkdirSync(path.join(COSMETICS_IMAGES_DIR, section), { recursive: true });
    }

    let enCatalog: Partial<Record<CosmeticSection, Record<string, unknown>[]>> = {};

    if (!options.skipJson) {
      log.epic.info(`[COSMETICS] Downloading catalog JSON (${languages.length} languages)...`);

      for (const lang of languages) {
        const catalog = await fetchAggregateCatalog(lang);
        const catalogPath = path.join(COSMETICS_CATALOG_DIR, `${lang}.json`);
        fs.writeFileSync(catalogPath, JSON.stringify(catalog), 'utf8');
        jsonFiles++;

        if (lang === 'en') enCatalog = catalog;

        try {
          const meta = await fetchNewMetadata(lang);
          fs.writeFileSync(path.join(COSMETICS_META_DIR, `new-${lang}.json`), JSON.stringify(meta), 'utf8');
          jsonFiles++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.epic.warn(`[COSMETICS] meta/new-${lang} failed: ${message}`);
        }

        log.epic.info(`[COSMETICS] catalog ${lang} saved`);
      }
    } else if (fs.existsSync(path.join(COSMETICS_CATALOG_DIR, 'en.json'))) {
      enCatalog = JSON.parse(fs.readFileSync(path.join(COSMETICS_CATALOG_DIR, 'en.json'), 'utf8'));
    } else {
      enCatalog = await fetchAggregateCatalog('en');
    }

    const { work, noImage: sectionNoImage, catalogCounts } = buildImageWorkList(sections, enCatalog);
    noImage = sectionNoImage;

    for (const section of sections) {
      const rows = enCatalog[section] ?? [];
      for (const item of rows) {
        if (!item?.id) continue;
        const id = String(item.id);
        const idKey = id.toLowerCase();
        const refs = collectCosmeticImageRefs(item, section);
        manifestItems[idKey] = buildManifestItemPaths(section, id, refs);
      }
      log.epic.info(`[COSMETICS] ${section}: ${catalogCounts[section] ?? 0} items, images pending ${work.filter((w) => w.section === section).length} variants`);
    }

    if (!options.skipImages) {
      log.epic.info(`[COSMETICS] Downloading ${work.length} image variants...`);

      const urlCache = new Map<string, string>();

      await mapConcurrent(work, concurrency, async (row) => {
        const destPath = imageVariantPath(row.section, row.id, row.variant);

        if (!force && fs.existsSync(destPath)) {
          skipped++;
          urlCache.set(row.url, destPath);
          return;
        }

        const cachedSource = urlCache.get(row.url);
        if (cachedSource && fs.existsSync(cachedSource)) {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(cachedSource, destPath);
          skipped++;
          urlCache.set(row.url, destPath);
          return;
        }

        try {
          await downloadImageWebp(row.url, destPath);
          downloaded++;
          urlCache.set(row.url, destPath);
        } catch (err: unknown) {
          failed++;
          const message = err instanceof Error ? err.message : String(err);
          log.epic.warn(`[COSMETICS] image fail ${row.section}/${row.id}/${row.variant}: ${message}`);
        }
      });

      for (const [idKey, item] of Object.entries(manifestItems)) {
        if (!item.portrait) continue;
        const src = path.join(COSMETICS_IMAGES_DIR, item.portrait.replace(/\//g, path.sep) + '.webp');
        const legacyPath = path.join(COSMETICS_ASSETS_DIR, item.section, `${idKey}.webp`);
        if (fs.existsSync(src) && (force || !fs.existsSync(legacyPath))) {
          try {
            fs.copyFileSync(src, legacyPath);
          } catch {
            // non-fatal
          }
        }
      }
    }

    const { manifestPath } = writeManifestAndLegacyIndex(manifestItems, catalogCounts, languages, work.length);
    clearLocalCatalogCache();

    const durationMs = Date.now() - started;
    log.epic.info(
      `[COSMETICS] Done json=${jsonFiles} img+${downloaded} skip=${skipped} fail=${failed} noImage=${noImage} · ${durationMs}ms`,
    );

    return {
      success: failed === 0,
      downloaded,
      skipped,
      failed,
      noImage,
      jsonFiles,
      imageVariants: work.length,
      manifestPath,
      durationMs,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.epic.error(`[COSMETICS] Sync error: ${message}`);
    return {
      success: false,
      downloaded,
      skipped,
      failed,
      noImage,
      jsonFiles,
      imageVariants: 0,
      manifestPath: path.join(COSMETICS_ASSETS_DIR, COSMETICS_MANIFEST_FILE),
      durationMs: Date.now() - started,
      error: message,
    };
  }
}

export function syncCosmeticsPortraits(options: CosmeticsSyncOptions = {}): Promise<CosmeticsSyncResult> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = runCosmeticsSync(options).finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export const syncCosmeticsCache = syncCosmeticsPortraits;

export { relativePortraitPath } from './cosmeticsSyncLegacy.ts';
