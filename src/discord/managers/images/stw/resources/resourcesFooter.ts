import sharp from 'sharp';

import { prepareLockerFooterLogo } from '#managers/images/br/locker/lockerBranding.ts';
import {
  LOCKER_FOOTER_LETTER_SPACING_RATIO,
  LOCKER_FOOTER_TEXT_SCALE_X,
} from '#managers/images/br/locker/lockerConstants.ts';
import {
  type LockerFooterTextSegment,
  renderLockerFooterStyledText,
} from '#managers/images/br/locker/lockerText.ts';
import { prepareBrandIcon } from '../campaign/stwCardBranding.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import { FALLBACK_LANGUAGE, translate } from '#helpers/locales/index.ts';
import type { StwImageBrandingOptions } from '../stwImageBranding.ts';

const FRAME_PNG = { compressionLevel: 0 } as const;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

const FOOTER_BRAND_TOKEN = 'Glow';
const FOOTER_LINK_TOKEN = 'glowhaven.site/discord';
const FOOTER_BRAND_COLOR = `#${EMBED_COLORS.success.toString(16).padStart(6, '0')}`;
const FOOTER_LINK_COLOR = '#00AFF4';

export interface StwImageFooterOptions extends Pick<StwImageBrandingOptions, 'footerIconUrl' | 'lang'> {}

interface FooterTokenMatch {
  index: number;
  length: number;
  segment: LockerFooterTextSegment;
}

function parseFooterSupportSegments(message: string): LockerFooterTextSegment[] {
  const tokens: FooterTokenMatch[] = [];

  let searchFrom = 0;
  while (true) {
    const linkIdx = message.indexOf(FOOTER_LINK_TOKEN, searchFrom);
    if (linkIdx === -1) break;
    tokens.push({
      index: linkIdx,
      length: FOOTER_LINK_TOKEN.length,
      segment: { text: FOOTER_LINK_TOKEN, color: FOOTER_LINK_COLOR, underline: true },
    });
    searchFrom = linkIdx + FOOTER_LINK_TOKEN.length;
  }

  searchFrom = 0;
  while (true) {
    const brandIdx = message.indexOf(FOOTER_BRAND_TOKEN, searchFrom);
    if (brandIdx === -1) break;
    const overlaps = tokens.some(
      (token) => brandIdx < token.index + token.length && brandIdx + FOOTER_BRAND_TOKEN.length > token.index,
    );
    if (!overlaps) {
      tokens.push({
        index: brandIdx,
        length: FOOTER_BRAND_TOKEN.length,
        segment: { text: FOOTER_BRAND_TOKEN, color: FOOTER_BRAND_COLOR },
      });
    }
    searchFrom = brandIdx + 1;
  }

  tokens.sort((a, b) => a.index - b.index);

  const segments: LockerFooterTextSegment[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.index > cursor) {
      segments.push({ text: message.slice(cursor, token.index) });
    }
    segments.push(token.segment);
    cursor = token.index + token.length;
  }

  if (cursor < message.length) {
    segments.push({ text: message.slice(cursor) });
  }

  return segments.length ? segments : [{ text: message }];
}

async function renderFittingFooterText(
  segments: LockerFooterTextSegment[],
  maxTextWidth: number,
  zoneH: number,
): Promise<{ png: Buffer; width: number; height: number; fontSize: number }> {
  let textSize = Math.max(16, Math.round(zoneH * 0.42));
  const minSize = 12;

  while (textSize >= minSize) {
    const letterSpacing = textSize * LOCKER_FOOTER_LETTER_SPACING_RATIO;
    const png = await renderLockerFooterStyledText(segments, textSize, {
      scaleX: LOCKER_FOOTER_TEXT_SCALE_X,
      letterSpacing,
    });
    const meta = await sharp(png).metadata();
    const width = meta.width ?? 0;
    if (width <= maxTextWidth || textSize === minSize) {
      return { png, width, height: meta.height ?? textSize, fontSize: textSize };
    }
    textSize -= 1;
  }

  const letterSpacing = minSize * LOCKER_FOOTER_LETTER_SPACING_RATIO;
  const png = await renderLockerFooterStyledText(segments, minSize, {
    scaleX: LOCKER_FOOTER_TEXT_SCALE_X,
    letterSpacing,
  });
  const meta = await sharp(png).metadata();
  return { png, width: meta.width ?? 0, height: meta.height ?? minSize, fontSize: minSize };
}

async function prepareFooterBrandIcon(size: number, footerIconUrl?: string | null): Promise<Buffer | null> {
  const ringWidth = Math.max(1, Math.round(size * 0.022));
  const innerSize = Math.max(12, size - ringWidth * 2);

  let inner = await prepareBrandIcon(innerSize, footerIconUrl);
  if (!inner) {
    const square = await prepareLockerFooterLogo(innerSize);
    if (!square) return null;
    const mask = Buffer.from(
      `<svg width="${innerSize}" height="${innerSize}"><circle cx="${innerSize / 2}" cy="${innerSize / 2}" r="${innerSize / 2}"/></svg>`,
    );
    inner = await sharp(square)
      .resize(innerSize, innerSize, { fit: 'cover', position: 'centre' })
      .composite([{ input: mask, blend: 'dest-in' }])
      .png(FRAME_PNG)
      .toBuffer();
  } else {
    const meta = await sharp(inner).metadata();
    if ((meta.width ?? 0) !== innerSize || (meta.height ?? 0) !== innerSize) {
      inner = await sharp(inner)
        .resize(innerSize, innerSize, { fit: 'cover', position: 'centre' })
        .png(FRAME_PNG)
        .toBuffer();
    }
  }

  const inset = Math.round((size - innerSize) / 2);
  const ringSvg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - ringWidth / 2}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="${ringWidth}"/>
    </svg>`,
  );

  return sharp({
    create: { width: size, height: size, channels: 4, background: TRANSPARENT },
  })
    .composite([
      { input: inner, top: inset, left: inset },
      { input: ringSvg, top: 0, left: 0 },
    ])
    .png(FRAME_PNG)
    .toBuffer();
}

/** Centered footer: rounded bot icon + localized Discord support line. */
export async function buildStwImageFooterBuffer(
  width: number,
  zoneH: number,
  options?: StwImageFooterOptions,
): Promise<Buffer> {
  const lang = options?.lang ?? FALLBACK_LANGUAGE;
  const message = translate('stwImage.footer.supportDiscord', lang);
  const segments = parseFooterSupportSegments(message);

  const sidePad = Math.max(12, Math.round(zoneH * 0.06));
  const textGap = Math.max(10, Math.round(zoneH * 0.12));

  const maxTextWidth = Math.max(120, width - sidePad * 2 - Math.round(zoneH * 0.95));
  const { png: textPng, width: textW, height: textH } = await renderFittingFooterText(segments, maxTextWidth, zoneH);

  const iconSize = Math.min(
    Math.max(34, Math.round(textH * 1.45)),
    Math.round(zoneH * 0.68),
  );
  const brandIcon = await prepareFooterBrandIcon(iconSize, options?.footerIconUrl);

  const rowH = Math.max(iconSize, textH);
  const verticalPad = Math.max(2, Math.round(zoneH * 0.04));
  const canvasH = rowH + verticalPad * 2;
  const rowTop = verticalPad;
  const blockW = (brandIcon ? iconSize + textGap : 0) + textW;
  const blockLeft = Math.max(sidePad, Math.floor((width - blockW) / 2));

  const iconTop = rowTop + Math.round((rowH - iconSize) / 2);
  const textTop = rowTop + Math.round((rowH - textH) / 2);
  const textLeft = blockLeft + (brandIcon ? iconSize + textGap : 0);

  const layers: sharp.OverlayOptions[] = [];
  if (brandIcon) {
    layers.push({ input: brandIcon, top: iconTop, left: blockLeft });
  }
  layers.push({ input: textPng, top: textTop, left: textLeft });

  return sharp({
    create: { width, height: canvasH, channels: 4, background: TRANSPARENT },
  })
    .composite(layers)
    .png(FRAME_PNG)
    .toBuffer();
}

/** @deprecated Use buildStwImageFooterBuffer */
export const buildResourcesFooterBuffer = buildStwImageFooterBuffer;
