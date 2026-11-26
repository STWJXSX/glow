import fs from 'fs';
import path from 'path';

let cachedGlowRoot: string | null = null;

function exists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/** Glow app root — works from any cwd. */
export function resolveGlowProjectRoot(): string {
  if (cachedGlowRoot) return cachedGlowRoot;

  const fromModule = path.resolve((import.meta.dirname ?? __dirname), '../../../..'); // helpers/core -> discord -> src -> glow
  for (const dir of [...new Set([fromModule, process.cwd()])]) {
    if (
      exists(path.join(dir, 'package.json'))
      && exists(path.join(dir, 'src/discord'))
    ) {
      cachedGlowRoot = dir;
      return dir;
    }
  }

  cachedGlowRoot = fromModule;
  return cachedGlowRoot;
}

export function resolveExistingPath(...candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function resolveStwCatalogRoot(): string {
  const root = resolveGlowProjectRoot();
  return (
    resolveExistingPath(
      path.join(root, 'assets/stw-catalog'),
      path.join(process.cwd(), 'assets/stw-catalog'),
    ) ?? path.join(root, 'assets/stw-catalog')
  );
}

export function resolveStwIconsRoot(): string {
  const root = resolveGlowProjectRoot();
  return path.join(root, 'assets/icons/stw');
}

/** Legacy hero portrait tree (Portrait/, TeamPerk/, class perk icons). */
export function resolveStwHeroesAllRoot(): string {
  const root = resolveGlowProjectRoot();
  return (
    resolveExistingPath(
      path.join(root, 'assets/icons/stw/heroes/all'),
      path.join(resolveStwCatalogRoot(), 'heroes/all'),
    ) ?? path.join(root, 'assets/icons/stw/heroes/all')
  );
}

export function resolveHeroPerksRoot(): string {
  return path.join(resolveStwCatalogRoot(), 'hero-perks');
}

/** Persistent runtime data dir (`GLOW_DATA_DIR`, default `<botRoot>/data`). */
export function resolveGlowDataDir(...segments: string[]): string {
  const override = process.env.GLOW_DATA_DIR?.trim();
  const base = override ? path.resolve(override) : path.join(resolveGlowProjectRoot(), 'data');
  return path.join(base, ...segments);
}

/** Persistent feed monitor state file (`GLOW_FEEDS_STATE_DIR`, default `<botRoot>/data/feeds`). */
export function resolveGlowFeedStatePath(fileName: string): string {
  const override = process.env.GLOW_FEEDS_STATE_DIR?.trim();
  const base = override ? path.resolve(override) : resolveGlowDataDir('feeds');
  return path.join(base, fileName);
}

/** Rebuildable runtime cache dir (`GLOW_CACHE_DIR`, default `<botRoot>/cache`). */
export function resolveGlowCacheDir(...segments: string[]): string {
  const override = process.env.GLOW_CACHE_DIR?.trim();
  const base = override ? path.resolve(override) : path.join(resolveGlowProjectRoot(), 'cache');
  return path.join(base, ...segments);
}

/** Runtime cache for extracted Fortnite paks used by sprite pipeline. */
export function resolveSpritePakCacheDir(): string {
  const override = process.env.SPRITE_PAKS_CACHE?.trim() || process.env.SPRITE_PAK_CACHE?.trim();
  if (override) return path.resolve(override);
  return resolveGlowCacheDir('fortnite-paks', 'sprites');
}

/**
 * Spirit catalog exported from the paks (`exportadores --sprites-catalog`): index.json plus
 * one {SEASON}/catalog.json + icons per SpriteLibrary plugin. Source of truth for both eras.
 */
export function resolveSpriteGameCatalogRoot(): string {
  const artifactsRoot = process.env.GLOW_ARTIFACTS_ROOT?.trim()
    || path.join(resolveGlowProjectRoot(), 'data', 'artifacts');
  return path.join(artifactsRoot, 'br', 'sprites', 'catalog');
}

export function resolveEpicLogoPath(): string | null {
  const root = resolveGlowProjectRoot();
  return resolveExistingPath(
    path.join(root, 'assets/icons/stw/logos/epicgames.png'),
    path.join(root, 'src/discord/helpers/data/images/epicgames.png'),
    path.join(root, 'src/discord/helpers/data/shop/epicgames.png'),
    path.join(resolveStwCatalogRoot(), 'logos/icon/epicgames.webp'),
    path.join(resolveStwCatalogRoot(), 'logos/icon/epicgames.png'),
  );
}

export function resolveGlowBrandIconPath(): string | null {
  const root = resolveGlowProjectRoot();
  return resolveExistingPath(
    path.join(root, 'assets/glow/icon.png'),
    path.join(root, 'assets/glow/glow.png'),
    path.join(root, 'src/discord/helpers/data/shop/glow-icon.png'),
    path.join(root, 'glow-icon.png'),
  );
}

export function resolveShopImagePath(fileName: string): string | null {
  const root = resolveGlowProjectRoot();
  return resolveExistingPath(
    path.join(root, 'src/discord/helpers/data/images', fileName),
    path.join(root, 'src/discord/helpers/data/shop', fileName),
  );
}

/** Resolve catalog/icon file across stw-catalog, assets/icons/stw, and legacy helpers/data. */
export function resolveStwAssetFile(catalogKey: string, relFile: string): string | null {
  const rel = relFile.replace(/^\/+/, '').replace(/\\/g, '/');
  const catalogRoot = resolveStwCatalogRoot();
  const iconsRoot = resolveStwIconsRoot();
  const glowRoot = resolveGlowProjectRoot();

  const bases = [
    path.join(catalogRoot, catalogKey),
    catalogRoot,
    path.join(iconsRoot, catalogKey),
    iconsRoot,
    path.join(glowRoot, 'assets/icons/stw', catalogKey),
    path.join(glowRoot, 'assets/icons/stw'),
  ];

  for (const base of bases) {
    const full = path.join(base, rel);
    if (exists(full)) return full;
  }

  return null;
}
