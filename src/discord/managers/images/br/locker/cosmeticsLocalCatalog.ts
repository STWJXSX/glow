import fs from 'fs';
import path from 'path';

import {
  FORTNITE_API_LANGUAGES,
  toFortniteApiLanguage,
  type FortniteApiLanguage,
  type SupportedLanguage,
} from '#helpers/locales/languages.ts';

import {
  COSMETIC_SECTIONS,
  COSMETICS_ASSETS_DIR,
  COSMETICS_CATALOG_DIR,
  COSMETICS_IMAGES_DIR,
  COSMETICS_INDEX_FILE,
  COSMETICS_MANIFEST_FILE,
  LOCAL_COSMETIC_URL_PREFIX,
  type CosmeticSection,
} from './cosmeticsConstants.ts';
import {
  collectCosmeticImageRefs,
  pickPortraitVariant,
  portraitVariantName,
  shopVariantName,
} from './cosmeticsImageUtils.ts';
import type { FortniteApiCosmetic } from './cosmeticsApiTypes.ts';

export interface CosmeticsManifestItem {
  section: CosmeticSection;
  variants: string[];
  portrait?: string;
  shop?: string;
}

export interface CosmeticsManifestV2 {
  v: 2;
  at: string;
  catalogLanguages: FortniteApiLanguage[];
  sections: CosmeticSection[];
  stats: {
    catalogItems: Partial<Record<CosmeticSection, number>>;
    imageFiles: number;
    imageVariants: number;
  };
  items: Record<string, CosmeticsManifestItem>;
}

export interface CosmeticsIndexLegacy {
  v: 1;
  at: string;
  n: number;
  items: Record<string, CosmeticSection>;
}

export type AggregateCosmeticsCatalog = Partial<Record<CosmeticSection, Record<string, unknown>[]>>;

const catalogCache = new Map<FortniteApiLanguage, AggregateCosmeticsCatalog>();
const catalogMapCache = new Map<FortniteApiLanguage, Map<string, FortniteApiCosmetic>>();

export function toLocalCosmeticUrl(relativePath: string): string {
  return `${LOCAL_COSMETIC_URL_PREFIX}${relativePath.replace(/\\/g, '/')}`;
}

export function isLocalCosmeticUrl(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith(LOCAL_COSMETIC_URL_PREFIX));
}

export function resolveCosmeticImageFile(ref: string): string | null {
  const normalized = ref.replace(/\\/g, '/').replace(/^@cosmetic\//, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const [section, id, ...rest] = parts;
  if (!COSMETIC_SECTIONS.includes(section as CosmeticSection)) return null;

  if (rest.length > 0) {
    const variantPath = path.join(COSMETICS_IMAGES_DIR, section, id, `${rest.join('_')}.webp`);
    if (fs.existsSync(variantPath)) return variantPath;
  }

  const legacyFlat = path.join(COSMETICS_ASSETS_DIR, section, `${id}.webp`);
  if (fs.existsSync(legacyFlat)) return legacyFlat;

  const anyVariantDir = path.join(COSMETICS_IMAGES_DIR, section, id);
  if (fs.existsSync(anyVariantDir)) {
    const files = fs.readdirSync(anyVariantDir).filter((f) => f.endsWith('.webp'));
    if (files[0]) return path.join(anyVariantDir, files[0]);
  }

  return null;
}

export function loadCosmeticsManifest(): CosmeticsManifestV2 | null {
  const manifestPath = path.join(COSMETICS_ASSETS_DIR, COSMETICS_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CosmeticsManifestV2;
  } catch {
    return null;
  }
}

export function loadCosmeticsIndex(): CosmeticsIndexLegacy | null {
  const manifestPath = path.join(COSMETICS_ASSETS_DIR, COSMETICS_INDEX_FILE);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CosmeticsIndexLegacy;
  } catch {
    return null;
  }
}

export function isLocalCatalogAvailable(lang?: SupportedLanguage): boolean {
  const apiLang = toFortniteApiLanguage(lang ?? 'en');
  return fs.existsSync(path.join(COSMETICS_CATALOG_DIR, `${apiLang}.json`));
}

export function loadAggregateCatalog(lang: SupportedLanguage): AggregateCosmeticsCatalog | null {
  const apiLang = toFortniteApiLanguage(lang);
  if (catalogCache.has(apiLang)) return catalogCache.get(apiLang)!;

  const catalogPath = path.join(COSMETICS_CATALOG_DIR, `${apiLang}.json`);
  if (!fs.existsSync(catalogPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as AggregateCosmeticsCatalog;
    catalogCache.set(apiLang, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function mapItemToApiCosmetic(
  item: Record<string, unknown>,
  section: CosmeticSection,
  manifestItem?: CosmeticsManifestItem,
): FortniteApiCosmetic | null {
  if (!item?.id) return null;

  const id = String(item.id);
  const idKey = id.toLowerCase();
  const refs = collectCosmeticImageRefs(item, section);
  const portraitRel = manifestItem?.portrait;
  const iconUrl = portraitRel
    ? toLocalCosmeticUrl(portraitRel)
    : pickPortraitVariant(refs, section);

  const rarityObj = item.rarity as { value?: string } | undefined;
  const seriesObj = item.series as { value?: string } | undefined;
  const typeObj = item.type as { backendValue?: string; value?: string } | undefined;

  return {
    id,
    name: String(item.name ?? item.title ?? id),
    rarity: String(rarityObj?.value ?? 'common').toLowerCase(),
    series: seriesObj?.value ? String(seriesObj.value).toLowerCase() : null,
    backendType: String(typeObj?.backendValue ?? typeObj?.value ?? ''),
    iconUrl,
    added: (item.added as string) ?? null,
    source: section === 'cars' ? 'cars' : 'br',
  };
}

export function loadLocalCosmeticCatalog(lang: SupportedLanguage): Map<string, FortniteApiCosmetic> {
  const apiLang = toFortniteApiLanguage(lang);
  if (catalogMapCache.has(apiLang)) return catalogMapCache.get(apiLang)!;

  const aggregate = loadAggregateCatalog(lang);
  const manifest = loadCosmeticsManifest();
  const map = new Map<string, FortniteApiCosmetic>();

  if (!aggregate) {
    catalogMapCache.set(apiLang, map);
    return map;
  }

  for (const section of COSMETIC_SECTIONS) {
    const rows = aggregate[section];
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      if (!row?.id) continue;
      const idKey = String(row.id).toLowerCase();
      const manifestItem = manifest?.items[idKey];
      const mapped = mapItemToApiCosmetic(row, section, manifestItem);
      if (mapped) map.set(idKey, mapped);
    }
  }

  catalogCache.set(apiLang, aggregate);
  catalogMapCache.set(apiLang, map);
  return map;
}

export function resolveCosmeticPortraitPath(cosmeticId: string, index?: CosmeticsIndexLegacy | null): string | null {
  const idKey = cosmeticId.toLowerCase();
  const manifest = loadCosmeticsManifest();
  const manifestItem = manifest?.items[idKey];

  if (manifestItem?.portrait) {
    const file = resolveCosmeticImageFile(manifestItem.portrait);
    if (file) return file;
  }

  const legacyIndex = index ?? loadCosmeticsIndex();
  const section = legacyIndex?.items[idKey];
  if (!section) return null;

  const legacyFlat = path.join(COSMETICS_ASSETS_DIR, section, `${idKey}.webp`);
  return fs.existsSync(legacyFlat) ? legacyFlat : null;
}

export function resolveCosmeticShopImagePath(cosmeticId: string): string | null {
  const idKey = cosmeticId.toLowerCase();
  const manifest = loadCosmeticsManifest();
  const rel = manifest?.items[idKey]?.shop;
  if (!rel) return null;
  return resolveCosmeticImageFile(rel);
}

export function resolveCosmeticImageByTemplateId(
  templateId: string,
  lang: SupportedLanguage,
  prefer: 'shop' | 'portrait' = 'shop',
): { name: string; imagePath: string | null; cosmeticId: string | null } | null {
  const aggregate = loadAggregateCatalog(lang);
  const manifest = loadCosmeticsManifest();
  if (!aggregate) return null;

  const slug = templateId.split(':')[1]?.toLowerCase() ?? '';
  if (!slug) return null;

  for (const section of COSMETIC_SECTIONS) {
    const rows = aggregate[section];
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      if (!row?.id) continue;
      const id = String(row.id);
      const idLower = id.toLowerCase();
      const idSlug = idLower.replace(/^cid_[a-z0-9]+_athena_commando_[mf]_/i, '');

      if (idLower !== slug && idSlug !== slug && !idLower.endsWith(slug) && !slug.endsWith(idSlug)) {
        continue;
      }

      const idKey = id.toLowerCase();
      const manifestItem = manifest?.items[idKey];
      const refs = collectCosmeticImageRefs(row, section);
      const rel = prefer === 'shop'
        ? manifestItem?.shop
        : manifestItem?.portrait;
      const imagePath = rel ? resolveCosmeticImageFile(rel) : null;

      return {
        name: String(row.name ?? row.title ?? id),
        imagePath,
        cosmeticId: id,
      };
    }
  }

  return null;
}

export function clearLocalCatalogCache(): void {
  catalogCache.clear();
  catalogMapCache.clear();
}

export function buildManifestItemPaths(
  section: CosmeticSection,
  id: string,
  refs: ReturnType<typeof collectCosmeticImageRefs>,
): CosmeticsManifestItem {
  const idKey = id.toLowerCase();
  const portraitV = portraitVariantName(refs, section);
  const shopV = shopVariantName(refs, section);
  const variants = refs.map((r) => r.variant);

  const item: CosmeticsManifestItem = { section, variants };

  if (portraitV) item.portrait = `${section}/${idKey}/${portraitV}`;
  if (shopV) item.shop = `${section}/${idKey}/${shopV}`;

  return item;
}

/** Preload all supported catalog languages into memory (optional warm-up). */
export function warmLocalCatalogCache(languages: readonly FortniteApiLanguage[] = FORTNITE_API_LANGUAGES): void {
  for (const lang of languages) {
    loadLocalCosmeticCatalog(lang as SupportedLanguage);
  }
}

export { FORTNITE_API_LANGUAGES };
