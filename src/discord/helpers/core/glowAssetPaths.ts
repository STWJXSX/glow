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

/** Glow app root (apps/bots/glow) — works from any cwd. */
export function resolveGlowProjectRoot(): string {
  if (cachedGlowRoot) return cachedGlowRoot;

  const candidates = [
    path.resolve((import.meta.dirname ?? __dirname), '../../../..'), // helpers/core -> discord -> src -> glow
    process.cwd(),
    path.resolve(process.cwd(), 'apps/bots/glow'),
  ];

  for (const dir of [...new Set(candidates)]) {
    if (
      exists(path.join(dir, 'package.json'))
      && exists(path.join(dir, 'src/discord'))
    ) {
      cachedGlowRoot = dir;
      return dir;
    }
  }

  cachedGlowRoot = process.cwd();
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
      path.join(process.cwd(), 'apps/bots/glow/assets/stw-catalog'),
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

let cachedMonorepoRoot: string | null = null;

/** Monorepo root: first ancestor of the Glow root that contains system/config/paths.cjs. */
export function resolveMonorepoRoot(): string {
  if (cachedMonorepoRoot) return cachedMonorepoRoot;
  let cur = resolveGlowProjectRoot();
  for (let i = 0; i < 10; i++) {
    if (exists(path.join(cur, 'system', 'config', 'paths.cjs'))) {
      cachedMonorepoRoot = cur;
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  cachedMonorepoRoot = path.resolve(resolveGlowProjectRoot(), '..', '..', '..');
  return cachedMonorepoRoot;
}

/** Runtime cache for extracted Fortnite paks used by sprite pipeline. */
export function resolveSpritePakCacheDir(): string {
  const override = process.env.SPRITE_PAKS_CACHE?.trim() || process.env.SPRITE_PAK_CACHE?.trim();
  if (override) return path.resolve(override);
  return path.join(
    resolveMonorepoRoot(),
    'apps',
    'web',
    'platform',
    '.cache',
    'fortnite-paks',
    'sprites',
  );
}

/**
 * Spirit catalog exported from the paks (`exportadores --sprites-catalog`): index.json plus
 * one {SEASON}/catalog.json + icons per SpriteLibrary plugin. Source of truth for both eras.
 * The web server's export-manager regenerates it per build under apps/services/exporter/artifacts/br/sprites/catalog
 * (the same files /api/br/sprites serves).
 */
export function resolveSpriteGameCatalogRoot(): string {
  const artifactsRoot = process.env.GLOW_ARTIFACTS_ROOT?.trim()
    || process.env.WEB_EXPORTS_ROOT?.trim()
    || path.join(resolveMonorepoRoot(), 'apps', 'services', 'exporter', 'artifacts');
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
    path.join(root, 'assets/icon.png'),
    path.join(root, 'src/discord/helpers/data/images/glow.png'),
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
