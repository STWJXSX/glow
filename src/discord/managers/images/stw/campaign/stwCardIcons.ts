import fs from 'fs';
import path from 'path';
import type { StwCardDisplayItem } from './types.ts';

function extFromMime(mime: string): string {
  if (mime === 'jpeg' || mime === 'jpg') return '.jpg';
  if (mime === 'png') return '.png';
  if (mime === 'webp') return '.webp';
  if (mime === 'gif') return '.gif';
  return '.webp';
}

function extFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext || '.webp';
}

function writeDataUrlToFile(dataUrl: string, dest: string): boolean {
  const match = String(dataUrl).match(/^data:image\/([\w+]+);base64,(.+)$/);
  if (!match) return false;
  fs.writeFileSync(dest, Buffer.from(match[2], 'base64'));
  return true;
}

function linkOrCopy(src: string, dest: string): boolean {
  if (process.platform !== 'win32') {
    try {
      fs.linkSync(src, dest);
      return true;
    } catch {
      /* fall through to copy */
    }
  }
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch {
    return false;
  }
}
async function materializeIconSrc(
  src: string | null,
  iconsDir: string,
  index: number,
): Promise<{ fileName: string | null; ok: boolean }> {
  if (!src) return { fileName: null, ok: false };
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return { fileName: null, ok: false };
  }

  let destExt = '.webp';
  if (src.startsWith('data:')) {
    const mime = src.match(/^data:image\/([\w+]+);/)?.[1] ?? 'webp';
    destExt = extFromMime(mime);
  } else {
    destExt = extFromPath(src);
  }

  const fileName = `${index}${destExt}`;
  const dest = path.join(iconsDir, fileName);

  if (src.startsWith('data:')) {
    const ok = writeDataUrlToFile(src, dest);
    return { fileName: ok ? fileName : null, ok };
  }

  if (fs.existsSync(src)) {
    if (path.isAbsolute(src)) {
      return { fileName: src, ok: true };
    }
    const ok = linkOrCopy(src, dest);
    return { fileName: ok ? fileName : null, ok };
  }
  return { fileName: null, ok: false };
}

export async function materializeCardIcons(
  items: StwCardDisplayItem[],
  iconsDir: string,
  concurrency = 32,
): Promise<StwCardDisplayItem[]> {
  fs.mkdirSync(iconsDir, { recursive: true });
  const out = [...items];
  let next = 0;

  async function worker(): Promise<void> {
    while (next < out.length) {
      const index = next++;
      const item = out[index];
      if (!item.iconSrc) {
        out[index] = { ...item, iconOk: false };
        continue;
      }
      const { fileName, ok } = await materializeIconSrc(item.iconSrc, iconsDir, index);
      out[index] = { ...item, iconFileName: fileName ?? undefined, iconOk: ok };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, out.length || 1) }, () => worker()),
  );
  return out;
}
