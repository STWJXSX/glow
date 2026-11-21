import sharp from 'sharp';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import type { STWShopOffer } from '#helpers/epic/stw/shop/stwShopOfferTypes.ts';
import { getRemainingPurchases } from '#helpers/epic/stw/shop/stwShopOfferTypes.ts';
import { extractStwRarity, getStwRarityTheme, type StwRarityTheme } from '#helpers/epic/stw/shop/stwShopCatalog.ts';
import {
  fileToDataUrl,
  loadStwAssetCatalogs,
  resolveStwCatalogItemName,
  resolveStwGoldIconDataUrl,
  resolveStwItemIcon,
  resolveStwShopBackgroundDataUrl,
} from '#helpers/epic/stw/shop/stwShopAssets.ts';
import {
  formatStwLimitLabel,
  getStwSectionTitle,
  getStwShopUiStrings,
  translateStwItemName,
  getStwSoldOutLabel,
} from '#helpers/epic/stw/shop/stwShopTranslations.ts';
import { log } from '#helpers/core/logger.ts';
import {
  RENDER_SCALE,
  applyCssFilters,
  baselineFor,
  containBuffer,
  dataUrlToBuffer,
  dropShadowLayer,
  maskRounded,
  measureUiText,
  mixHex,
  round,
  svgText,
  uiMetrics,
  wrapText,
} from '#managers/images/stw/stwSharpRenderUtils.ts';

const CARD_SIZE = 196;
const CARD_GAP = 16;
const GRID_COLS = 4;
const SHOPS_GAP = 22;
const CARD_FOOTER = Math.round(CARD_SIZE * 0.28); // 55

const S = RENDER_SCALE;
const GRID_W = GRID_COLS * CARD_SIZE + (GRID_COLS - 1) * CARD_GAP;
const SECTION_W = GRID_W + 18 * 2 + 2; // padding + border

export interface StwShopDisplayItem extends STWShopOffer {
  displayName: string;
  limitLabel: string;
  iconDataUrl: string | null;
  remainingPurchases: number;
  soldOut: boolean;
}

export interface StwShopDisplaySection {
  key: string;
  titleLabel: string;
  items: StwShopDisplayItem[];
}

export function buildStwShopSections(
  offers: STWShopOffer[],
  lang: SupportedLanguage,
): StwShopDisplaySection[] {
  const catalogs = loadStwAssetCatalogs();
  const grouped = new Map<string, StwShopDisplayItem[]>();

  for (const offer of offers) {
    const remainingPurchases = getRemainingPurchases(offer);
    const soldOut = remainingPurchases <= 0;
    const catalogName = resolveStwCatalogItemName(offer.templateId, catalogs, offer.templateId);
    const item: StwShopDisplayItem = {
      ...offer,
      displayName: translateStwItemName(offer.templateId, lang, { catalogName }),
      limitLabel: soldOut ? getStwSoldOutLabel(lang) : formatStwLimitLabel(offer, lang),
      iconDataUrl: fileToDataUrl(resolveStwItemIcon(offer.templateId, catalogs)),
      remainingPurchases,
      soldOut,
    };

    const list = grouped.get(offer.section) ?? [];
    list.push(item);
    grouped.set(offer.section, list);
  }

  const order = ['event-items', 'weekly-items'];
  return order
    .filter((key) => grouped.has(key))
    .map((key) => ({
      key,
      titleLabel: getStwSectionTitle(key, lang),
      items: grouped.get(key)!,
    }));
}

function localeFor(lang: SupportedLanguage): string {
  return lang === 'es' ? 'es-ES' : 'en-US';
}

function buildRarityBackground(theme: StwRarityTheme): Buffer {
  const size = CARD_SIZE * S;
  const glowMix = mixHex(theme.glow, '#ffffff', 0.85);
  const cx = size / 2;
  const cy = size * 0.12;
  const radius = Math.sqrt((size - cx) ** 2 + (size - cy) ** 2);
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${round(cx)}" cy="${round(cy)}" r="${round(radius)}">
        <stop offset="0%" stop-color="rgb(${glowMix.r},${glowMix.g},${glowMix.b})"/>
        <stop offset="44%" stop-color="rgb(${glowMix.r},${glowMix.g},${glowMix.b})" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="base" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${theme.top}"/>
        <stop offset="54%" stop-color="${theme.mid}"/>
        <stop offset="100%" stop-color="${theme.bottom}"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${10 * S}" fill="url(#base)"/>
    <rect width="${size}" height="${size}" rx="${10 * S}" fill="url(#glow)"/>
    <rect x="${S / 2}" y="${S / 2}" width="${size - S}" height="${size - S}" rx="${10 * S}" fill="none"
      stroke="${theme.border}" stroke-opacity="0.5" stroke-width="${S}"/>
  </svg>`;
  return Buffer.from(svg);
}

interface CardLayout {
  lines: string[];
  infoH: number;
  h3Top: number;
  limitTop: number | null;
  priceTop: number;
}

function layoutCard(item: StwShopDisplayItem, lang: SupportedLanguage): CardLayout {
  const textWidth = CARD_SIZE - 16;
  const fontSize = 13;
  const lineHeight = 14.95;
  const measure = (value: string) => measureUiText(value, fontSize, 800);
  const lines = wrapText(item.displayName, textWidth, 2, measure);
  const lineCount = Math.max(1, lines.length);
  const h3H = lineCount * lineHeight;
  const hasLimit = !item.soldOut && Boolean(item.limitLabel);
  const limitH = hasLimit ? 18 : 0;
  const contentH = h3H + (hasLimit ? 2 + limitH : 0) + 2 + 1 + 22;
  const infoH = Math.max(CARD_FOOTER, 13 + contentH);
  const priceTop = infoH - 7 - 22;
  const limitTop = hasLimit ? priceTop - 1 - 2 - limitH : null;
  const h3Top = (limitTop ?? priceTop - 1 - 2) - 2 - h3H;
  return { lines, infoH, h3Top, limitTop, priceTop };
}

function qtyBadgeSvg(text: string, width: number, height: number): Buffer {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="q" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.96)"/>
      <stop offset="100%" stop-color="rgba(221,239,255,0.92)"/>
    </linearGradient></defs>
    <rect width="${width}" height="${height}" rx="${6 * S}" fill="url(#q)"/>
  </svg>`);
}

async function renderCard(item: StwShopDisplayItem, lang: SupportedLanguage): Promise<Buffer> {
  const theme = getStwRarityTheme(extractStwRarity(item.templateId));
  const layout = layoutCard(item, lang);
  const layers: sharp.OverlayOptions[] = [];
  const cardPx = CARD_SIZE * S;

  if (item.iconDataUrl) {
    const raw = dataUrlToBuffer(item.iconDataUrl);
    if (raw) {
      try {
        let icon = raw;
        if (item.soldOut) {
          icon = await applyCssFilters(icon, { grayscale: 1, brightness: 0.7, opacity: 0.75 });
        } else {
          icon = await applyCssFilters(icon, { saturate: 1.06, contrast: 1.05 });
        }
        const contained = await containBuffer(icon, (CARD_SIZE - 20) * S, (CARD_SIZE - CARD_FOOTER - 20) * S);
        const shadow = await dropShadowLayer(contained.buffer, {
          offsetX: 0,
          offsetY: 8 * S,
          sigma: 10 * S,
          opacity: 0.42,
        });
        const pad = Math.ceil(10 * S * 3) + 4;
        const boxW = contained.width + pad * 2;
        const boxH = contained.height + 8 * S + pad * 2;
        const iconLayer = await sharp({
          create: { width: boxW, height: boxH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        })
          .composite([
            { input: shadow.buffer, left: pad, top: pad + 8 * S },
            { input: contained.buffer, left: pad, top: pad },
          ])
          .png()
          .toBuffer();
        layers.push({
          input: iconLayer,
          left: 10 * S + contained.offsetX - pad,
          top: 10 * S + contained.offsetY - pad,
        });
      } catch {
        // Broken icon file: fall through to the "?" placeholder.
      }
    }
  }
  if (!layers.length) {
    layers.push({
      input: Buffer.from(`<svg width="${cardPx}" height="${cardPx}" xmlns="http://www.w3.org/2000/svg">
        ${svgText({
          text: '?',
          x: (CARD_SIZE / 2) * S,
          y: ((CARD_SIZE - CARD_FOOTER) / 2 + 20) * S,
          font: 'ui',
          fontSize: 56 * S,
          weight: 900,
          fill: 'rgba(255,255,255,0.45)',
          anchor: 'middle',
        })}
      </svg>`),
      left: 0,
      top: 0,
    });
  }

  if (item.quantity > 1 && !item.soldOut) {
    const qtyText = `×${item.quantity}`;
    const qtyW = Math.max(28, measureUiText(qtyText, 13, 900) + 14);
    const qtyH = 23;
    const qtyX = CARD_SIZE - 6 - qtyW;
    const qtyY = 6;
    layers.push({
      input: qtyBadgeSvg(qtyText, qtyW * S, qtyH * S),
      left: Math.round(qtyX * S),
      top: Math.round(qtyY * S),
    });
    layers.push({
      input: Buffer.from(`<svg width="${qtyW * S}" height="${qtyH * S}" xmlns="http://www.w3.org/2000/svg">${svgText({
        text: qtyText,
        x: (qtyW / 2) * S,
        y: (3 + 14) * S,
        font: 'ui',
        fontSize: 13 * S,
        weight: 900,
        fill: '#09316f',
        anchor: 'middle',
      })}</svg>`),
      left: Math.round(qtyX * S),
      top: Math.round(qtyY * S),
    });
  }

  const infoY = CARD_SIZE - layout.infoH;
  const h3Base = infoY + layout.h3Top;
  const limitBase = layout.limitTop === null ? null : infoY + layout.limitTop;
  const priceBase = infoY + layout.priceTop;
  layers.push({
    input: Buffer.from(`<svg width="${cardPx}" height="${layout.infoH * S}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="info" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(0,0,0,0.08)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.88)"/>
      </linearGradient></defs>
      <rect width="${cardPx}" height="${layout.infoH * S}" fill="url(#info)"/>
    </svg>`),
    left: 0,
    top: Math.round(infoY * S),
  });

  const nameFill = item.soldOut ? 'rgba(255,255,255,0.55)' : '#ffffff';
  const nameParts: string[] = [];
  const nameMetrics = uiMetrics(13);
  for (let i = 0; i < layout.lines.length; i++) {
    const top = h3Base + i * 14.95;
    const baseline = baselineFor(top, 14.95, nameMetrics) + 1;
    nameParts.push(svgText({
      text: layout.lines[i]!,
      x: 8 * S,
      y: baseline * S,
      font: 'ui',
      fontSize: 13 * S,
      weight: 800,
      fill: nameFill,
    }));
    if (item.soldOut) {
      nameParts.push(`<line x1="${8 * S}" y1="${round((baseline - 4.5) * S)}" x2="${round((8 + measureUiText(layout.lines[i]!, 13, 800)) * S)}" y2="${round((baseline - 4.5) * S)}" stroke="rgba(255,255,255,0.55)" stroke-width="${S}"/>`);
    }
  }
  layers.push({
    input: Buffer.from(`<svg width="${cardPx}" height="${cardPx}" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="name-clip"><rect x="${8 * S}" y="${h3Base * S}" width="${180 * S}" height="${layout.lines.length * 14.95 * S}"/></clipPath></defs>
      <g clip-path="url(#name-clip)">${nameParts.join('')}</g>
    </svg>`),
    left: 0,
    top: 0,
  });

  if (layout.limitTop !== null) {
    const limitText = item.limitLabel;
    const textW = measureUiText(limitText, 10, 700);
    const limitW = textW + 14 + 2;
    const limitY = limitBase!;
    layers.push({
      input: Buffer.from(`<svg width="${cardPx}" height="${cardPx}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${(8.5) * S}" y="${(limitY + 0.5) * S}" width="${(limitW - 1) * S}" height="${17 * S}" rx="${8.5 * S}"
          fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.25)" stroke-width="${S}"/>
        ${svgText({
          text: limitText,
          x: (8 + 1 + 7) * S,
          y: (limitY + 1 + 1 + 11) * S,
          font: 'ui',
          fontSize: 10 * S,
          weight: 700,
          fill: '#ffffff',
        })}
      </svg>`),
      left: 0,
      top: 0,
    });
  }

  const priceText = item.price.toLocaleString(localeFor(lang));
  const priceW = measureUiText(priceText, 17, 900);
  const priceRight = CARD_SIZE - 8;
  const priceY = priceBase;
  const goldX = priceRight - priceW - 5 - 22;
  const priceOpacity = item.soldOut ? 0.45 : 1;
  const goldIcon = resolveStwGoldIconDataUrl();
  if (goldIcon) {
    const raw = dataUrlToBuffer(goldIcon);
    if (raw) {
      try {
        const contained = await containBuffer(raw, 22 * S, 22 * S);
        let goldBuf = contained.buffer;
        if (priceOpacity !== 1) goldBuf = await applyCssFilters(goldBuf, { opacity: priceOpacity });
        layers.push({
          input: goldBuf,
          left: Math.round((goldX + contained.offsetX) * S),
          top: Math.round((priceY + contained.offsetY) * S),
        });
      } catch {
        // Ignore unreadable currency icon.
      }
    }
  }
  const priceParts = [svgText({
    text: priceText,
    x: priceRight * S,
    y: (priceY + 18) * S,
    font: 'ui',
    fontSize: 17 * S,
    weight: 900,
    fill: '#ffe566',
    anchor: 'end',
    opacity: priceOpacity,
  })];
  if (item.soldOut) {
    priceParts.push(`<line x1="${round((priceRight - priceW) * S)}" y1="${round((priceY + 19) * S)}" x2="${round(priceRight * S)}" y2="${round((priceY + 19) * S)}" stroke="#ffe566" stroke-opacity="${priceOpacity}" stroke-width="${S}"/>`);
  }
  layers.push({
    input: Buffer.from(`<svg width="${cardPx}" height="${cardPx}" xmlns="http://www.w3.org/2000/svg">${priceParts.join('')}</svg>`),
    left: 0,
    top: 0,
  });

  if (item.soldOut) {
    const label = getStwSoldOutLabel(lang).toUpperCase();
    const fontSize = 12;
    const letterSpacing = fontSize * 0.08;
    const textW = measureUiText(label, fontSize, 900, letterSpacing);
    const badgeW = Math.ceil(textW) + 28 + 2;
    const badgeH = 28;
    const cx = CARD_SIZE / 2;
    const cy = CARD_SIZE / 2;
    const bx = cx - badgeW / 2;
    const by = cy - badgeH / 2;
    const badge = `<g filter="url(#badge-shadow)" transform="rotate(-14 ${round(cx * S)} ${round(cy * S)})">
      <rect x="${round(bx * S)}" y="${round(by * S)}" width="${badgeW * S}" height="${badgeH * S}" rx="${6 * S}"
        fill="rgba(185,28,28,0.92)" stroke="rgba(255,255,255,0.25)" stroke-width="${S}"/>
      ${svgText({
        text: label,
        x: cx * S,
        y: (by + 1 + 5 + 13) * S,
        font: 'ui',
        fontSize: fontSize * S,
        weight: 900,
        fill: '#ffffff',
        anchor: 'middle',
        letterSpacing: letterSpacing * S,
      })}
    </g>`;
    layers.push({
      input: Buffer.from(`<svg width="${cardPx}" height="${cardPx}" xmlns="http://www.w3.org/2000/svg">
        <defs><filter id="badge-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="${3 * S}" stdDeviation="${5 * S}" flood-color="#000" flood-opacity="0.45"/>
        </filter></defs>
        <rect width="${cardPx}" height="${cardPx}" fill="rgba(0,0,0,0.38)"/>
        ${badge}
      </svg>`),
      left: 0,
      top: 0,
    });
  }

  let card = await sharp(buildRarityBackground(theme))
    .composite(layers)
    .png()
    .toBuffer();
  card = await maskRounded(card, 10 * S);
  if (item.soldOut) {
    card = await applyCssFilters(card, { grayscale: 0.9, brightness: 0.48, saturate: 0.35, opacity: 0.82 });
  }
  return card;
}

async function buildCardShadow(): Promise<Buffer> {
  const pad = 24 * S;
  const size = CARD_SIZE * S;
  const total = size + pad * 2;
  const mask = Buffer.from(`<svg width="${total}" height="${total}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${pad}" y="${pad}" width="${size}" height="${size}" rx="${10 * S}" fill="rgba(0,0,0,0.28)"/>
  </svg>`);
  const blurred = await sharp(mask).blur(8 * S).png().toBuffer();
  return blurred;
}

async function renderSectionBase(
  base: Buffer,
  sectionX: number,
  sectionY: number,
  sectionH: number,
): Promise<Buffer> {
  const left = Math.round(sectionX * S);
  const top = Math.round(sectionY * S);
  const width = Math.round(SECTION_W * S);
  const height = Math.round(sectionH * S);
  const region = await sharp(base).extract({ left, top, width, height }).blur(6 * S).png().toBuffer();
  return sharp(base)
    .composite([{ input: region, left, top }])
    .png()
    .toBuffer();
}

function buildHeaderOverlay(
  sections: StwShopDisplaySection[],
  sectionHeights: number[],
  lang: SupportedLanguage,
  bodyW: number,
  bodyH: number,
  generatedAt: Date,
): Buffer {
  const ui = getStwShopUiStrings(lang);
  const locale = localeFor(lang);
  const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const width = bodyW * S;
  const height = bodyH * S;
  const parts: string[] = [];
  const h1Size = 38;
  const h1Metrics = uiMetrics(h1Size);
  parts.push(`<defs>
    <filter id="title-shadow" x="-20%" y="-40%" width="140%" height="200%">
      <feDropShadow dx="0" dy="${2 * S}" stdDeviation="${5 * S}" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>`);
  parts.push(svgText({
    text: ui.title.toUpperCase(),
    x: 40 * S,
    y: baselineFor(28, 51, h1Metrics) * S,
    font: 'ui',
    fontSize: h1Size * S,
    weight: 700,
    fill: '#ffffff',
    letterSpacing: 0.03 * h1Size * S,
    extra: 'filter="url(#title-shadow)"',
  }));
  const metaFont = 14;
  const metaText = `${itemCount} ${ui.items} · ${ui.refresh} 1h · ${generatedAt.toLocaleString(locale)}`;
  parts.push(svgText({
    text: metaText,
    x: 40 * S,
    y: baselineFor(83, 19, uiMetrics(metaFont)) * S,
    font: 'ui',
    fontSize: metaFont * S,
    weight: 400,
    fill: 'rgba(255,255,255,0.72)',
  }));
  parts.push(`<rect x="${40 * S}" y="${116 * S}" width="${(bodyW - 80) * S}" height="${2 * S}" fill="rgba(255,255,255,0.18)"/>`);

  let sectionX = 40;
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    const sectionH = sectionHeights[index]!;
    const radius = 16 * S;
    parts.push(`<rect x="${sectionX * S}" y="${140 * S}" width="${SECTION_W * S}" height="${sectionH * S}" rx="${radius}" fill="rgba(255,255,255,0.06)"/>`);
    parts.push(`<rect x="${(sectionX + 0.5) * S}" y="${140.5 * S}" width="${(SECTION_W - 1) * S}" height="${(sectionH - 1) * S}" rx="${radius}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="${S}"/>`);
    const h2Size = 24;
    parts.push(svgText({
      text: section.titleLabel.toUpperCase(),
      x: (sectionX + 19) * S,
      y: baselineFor(157, 32, uiMetrics(h2Size)) * S,
      font: 'ui',
      fontSize: h2Size * S,
      weight: 700,
      fill: '#ffffff',
      letterSpacing: 0.05 * h2Size * S,
    }));
    parts.push(svgText({
      text: `${section.items.length} ${ui.items}`,
      x: (sectionX + SECTION_W - 19) * S,
      y: baselineFor(168, 19, uiMetrics(14)) * S,
      font: 'ui',
      fontSize: 14 * S,
      weight: 400,
      fill: 'rgba(255,255,255,0.55)',
      anchor: 'end',
    }));
    sectionX += SECTION_W + SHOPS_GAP;
  }
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`);
}

async function renderShopToBuffer(
  sections: StwShopDisplaySection[],
  lang: SupportedLanguage,
  generatedAt: Date,
): Promise<Buffer> {
  const sectionHeights = sections.map((section) => {
    const rows = Math.max(1, Math.ceil(section.items.length / GRID_COLS));
    const gridH = rows * CARD_SIZE + (rows - 1) * CARD_GAP;
    return gridH + 84;
  });
  const rowH = Math.max(...sectionHeights);
  const bodyW = 80 + sections.length * SECTION_W + Math.max(0, sections.length - 1) * SHOPS_GAP;
  const bodyH = rowH + 176;
  const frameW = Math.max(1200, Math.ceil(bodyW * 1.015));
  const frameH = Math.max(900, Math.ceil(bodyH * 1.015));
  const width = frameW * S;
  const height = frameH * S;

  const overlays: sharp.OverlayOptions[] = [];
  const bgDataUrl = resolveStwShopBackgroundDataUrl();
  if (bgDataUrl) {
    const raw = dataUrlToBuffer(bgDataUrl);
    if (raw) {
      const bgW = bodyW * S;
      const bgH = bodyH * S;
      let bg = await sharp(raw).resize(bgW, bgH, { fit: 'cover' }).blur(1 * S).png().toBuffer();
      bg = await applyCssFilters(bg, { brightness: 0.72, saturate: 1.08 });
      const scaledW = Math.round(bgW * 1.03);
      const scaledH = Math.round(bgH * 1.03);
      bg = await sharp(bg).resize(scaledW, scaledH, { fit: 'fill', kernel: 'linear' }).png().toBuffer();
      const rawLeft = -Math.round((scaledW - bgW) / 2);
      const rawTop = -Math.round((scaledH - bgH) / 2);
      const srcLeft = Math.max(0, -rawLeft);
      const srcTop = Math.max(0, -rawTop);
      const destLeft = Math.max(0, rawLeft);
      const destTop = Math.max(0, rawTop);
      const cropW = Math.min(scaledW - srcLeft, width - destLeft);
      const cropH = Math.min(scaledH - srcTop, height - destTop);
      if (cropW > 0 && cropH > 0) {
        const visible = await sharp(bg)
          .extract({ left: srcLeft, top: srcTop, width: cropW, height: cropH })
          .png()
          .toBuffer();
        overlays.push({ input: visible, left: destLeft, top: destTop });
      }
    }
  }
  overlays.push({
    input: Buffer.from(`<svg width="${bodyW * S}" height="${bodyH * S}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="ov" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(18,28,44,0.45)"/>
        <stop offset="100%" stop-color="rgba(22,32,50,0.62)"/>
      </linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#ov)"/>
    </svg>`),
    left: 0,
    top: 0,
  });

  let canvas = await sharp({
    create: { width, height, channels: 4, background: { r: 22, g: 32, b: 50, alpha: 255 } },
  })
    .composite(overlays)
    .png()
    .toBuffer();

  let sectionX = 40;
  for (let index = 0; index < sections.length; index++) {
    canvas = await renderSectionBase(canvas, sectionX, 140, sectionHeights[index]!);
    sectionX += SECTION_W + SHOPS_GAP;
  }

  const shadow = await buildCardShadow();
  const shadowPad = 24 * S;
  const cardLayers: sharp.OverlayOptions[] = [];
  const gridTop = 205;
  sectionX = 40;
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    for (let itemIndex = 0; itemIndex < section.items.length; itemIndex++) {
      const col = itemIndex % GRID_COLS;
      const row = Math.floor(itemIndex / GRID_COLS);
      const left = sectionX + 19 + col * (CARD_SIZE + CARD_GAP);
      const top = gridTop + row * (CARD_SIZE + CARD_GAP);
      cardLayers.push({
        input: shadow,
        left: Math.round(left * S) - shadowPad,
        top: Math.round(top * S) - shadowPad + 6 * S,
      });
    }
    sectionX += SECTION_W + SHOPS_GAP;
  }

  const cards: sharp.OverlayOptions[] = [];
  sectionX = 40;
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    for (let itemIndex = 0; itemIndex < section.items.length; itemIndex++) {
      const col = itemIndex % GRID_COLS;
      const row = Math.floor(itemIndex / GRID_COLS);
      const left = sectionX + 19 + col * (CARD_SIZE + CARD_GAP);
      const top = gridTop + row * (CARD_SIZE + CARD_GAP);
      cards.push({
        input: await renderCard(section.items[itemIndex]!, lang),
        left: Math.round(left * S),
        top: Math.round(top * S),
      });
    }
    sectionX += SECTION_W + SHOPS_GAP;
  }

  const header = buildHeaderOverlay(sections, sectionHeights, lang, bodyW, bodyH, generatedAt);
  return sharp(canvas)
    .composite([{ input: header, left: 0, top: 0 }, ...cardLayers, ...cards])
    .png()
    .toBuffer();
}

export async function generateStwShopImage(
  offers: STWShopOffer[],
  lang: SupportedLanguage,
): Promise<{ buffer: Buffer; sections: StwShopDisplaySection[] }> {
  const sections = buildStwShopSections(offers, lang);
  if (sections.every((section) => section.items.length === 0)) {
    throw new Error('No STW shop items available');
  }

  const buffer = await renderShopToBuffer(sections, lang, new Date());
  log.epic.info(
    { lang, items: offers.length, sizeMb: (buffer.length / 1024 / 1024).toFixed(2) },
    '[STW Shop] Imagen generada',
  );
  return { buffer, sections };
}

export async function closeStwShopBrowser(): Promise<void> {
  // Kept for callers of the old Chromium implementation; sharp keeps no browser alive.
}
