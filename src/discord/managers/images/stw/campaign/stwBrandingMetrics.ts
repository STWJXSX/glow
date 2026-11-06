import sharp from 'sharp';

import { getCardDimensions } from './stwFortniteCard.ts';
import type { BrandingMetrics } from './types.ts';

const PAD_X = 24;
const GRID_PAD = 14;

export function computeGridFrameWidth(gridCols: number, cardSize: number, cardGap = 4): number {
  const dims = getCardDimensions(cardSize);
  const gridW = gridCols * dims.width + (gridCols - 1) * cardGap + GRID_PAD * 2;
  return gridW + PAD_X * 2;
}

export function computeBrandingMetrics(frameWidth: number): BrandingMetrics {
  const headerH = Math.round(Math.min(168, Math.max(112, frameWidth * 0.055)));
  const scale = headerH / 80;
  return {
    headerH,
    watermarkH: Math.round(68 * scale),
    avatarSize: Math.round(56 * scale),
    iconSize: Math.round(38 * scale),
    titleFont: Math.round(30 * scale),
    metaFont: Math.round(15 * scale),
    dateFont: Math.round(14 * scale),
    inviteFont: Math.round(15 * scale),
    avatarTop: Math.round(12 * scale),
    iconTop: Math.round(12 * scale),
    avatarGap: Math.round(16 * scale),
    iconGap: Math.round(14 * scale),
    ruleOffset: Math.round(10 * scale),
    strokeWidth: Math.max(2, Math.round(2 * scale)),
  };
}

/** Extra vertical space below the card grid to center the support footer. */
export const STW_FOOTER_ZONE_EXTRA = 28;

export function getStwFooterZoneHeight(watermarkH: number): number {
  return watermarkH + STW_FOOTER_ZONE_EXTRA;
}

export async function getStwFooterCompositeTop(
  gridBottom: number,
  footerZoneH: number,
  footerBuf: Buffer,
): Promise<number> {
  const { height = 0 } = await sharp(footerBuf).metadata();
  return gridBottom + Math.max(0, Math.round((footerZoneH - height) / 2));
}
