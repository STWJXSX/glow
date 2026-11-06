import fs from 'fs';
import path from 'path';

/** Runtime cache — always under dist, never src. */
const CACHE_DIR = path.join(
  process.cwd(),
  'dist',
  'discord',
  'managers',
  'images',
  'stw',
  'world-info',
  'cache',
);

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
