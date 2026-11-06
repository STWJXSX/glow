import fs from 'fs';
import sharp from 'sharp';import { resolveGlowBrandIconPath } from '#helpers/core/glowAssetPaths.ts';

export function resolveLockerFooterLogoPath(): string | null {
  return resolveGlowBrandIconPath();
}



export async function loadLockerFooterLogoRaw(): Promise<Buffer | null> {

  const logoPath = resolveLockerFooterLogoPath();

  if (!logoPath) return null;

  return fs.readFileSync(logoPath);

}



export async function prepareLockerFooterLogo(size = 48): Promise<Buffer | null> {

  const logoPath = resolveLockerFooterLogoPath();

  if (!logoPath) return null;



  return sharp(fs.readFileSync(logoPath))

    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })

    .png()

    .toBuffer();

}



export async function buildVerifiedBadge(size = 14): Promise<Buffer> {

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">

    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#9B59F7"/>

    <path d="M${size * 0.28} ${size * 0.52} L${size * 0.44} ${size * 0.68} L${size * 0.74} ${size * 0.34}"

      fill="none" stroke="#ffffff" stroke-width="${Math.max(2, size * 0.12)}"

      stroke-linecap="round" stroke-linejoin="round"/>

  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();

}


