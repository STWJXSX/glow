import fs from 'fs';
import path from 'path';
import { resolveGlowCacheDir } from '#helpers/core/glowAssetPaths.ts';

function resolveWorldInfoCacheDir(): string {
  const override = process.env.GLOW_WORLD_INFO_CACHE_DIR?.trim();
  return override ? path.resolve(override) : resolveGlowCacheDir('world-info');
}

const CACHE_DIR = resolveWorldInfoCacheDir();

export function getWorldInfoCacheDir(): string {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  return CACHE_DIR;
}

export function saveWorldInfoImage(fileName: string, buffer: Buffer): string {
  const dir = getWorldInfoCacheDir();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(dir, safeName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function cleanupWorldInfoCache(): number {
  const dir = getWorldInfoCacheDir();
  let removed = 0;
  for (const entry of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, entry));
      removed++;
    } catch {
      // skip locked/missing
    }
  }
  return removed;
}
