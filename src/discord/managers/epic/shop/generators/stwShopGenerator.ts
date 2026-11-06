import fs from 'fs';
import path from 'path';
import puppeteer, { type Browser } from 'puppeteer-core';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import type { STWShopOffer } from '#helpers/epic/stw/shop/stwShopOfferTypes.ts';
import { getRemainingPurchases } from '#helpers/epic/stw/shop/stwShopOfferTypes.ts';
import { extractStwRarity, getStwRarityTheme } from '#helpers/epic/stw/shop/stwShopCatalog.ts';
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

const CARD_SIZE = 196;
const CARD_GAP = 16;
const GRID_COLS = 4;
const SHOPS_GAP = 22;
const CARD_FOOTER = Math.round(CARD_SIZE * 0.28);

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

let sharedBrowser: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

function resolveBrowserExecutable(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error('No se encontró Chrome/Edge para renderizar la tienda STW.');
}

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser?.connected) return sharedBrowser;
  if (!browserLaunchPromise) {
    browserLaunchPromise = puppeteer.launch({
      executablePath: resolveBrowserExecutable(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  sharedBrowser = await browserLaunchPromise;
  browserLaunchPromise = null;
  return sharedBrowser;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function buildHtml(sections: StwShopDisplaySection[], lang: SupportedLanguage, generatedAt = new Date()): string {
  const ui = getStwShopUiStrings(lang);
  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  const bgDataUrl = resolveStwShopBackgroundDataUrl() || '';
  const goldIconDataUrl = resolveStwGoldIconDataUrl() || '';
  const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  const sectionHtml = sections
    .map((section) => {
      const cards = section.items
        .map((item) => {
          const theme = getStwRarityTheme(extractStwRarity(item.templateId));
          const themeCss =
            `--card-top:${theme.top};` +
            `--card-mid:${theme.mid};` +
            `--card-bottom:${theme.bottom};` +
            `--card-glow:${theme.glow};` +
            `--card-border:${theme.border};`;
          const qtyBadge = item.quantity > 1 && !item.soldOut ? `<span class="qty">×${item.quantity}</span>` : '';
          const limitBadge = !item.soldOut && item.limitLabel
            ? `<span class="limit">${escapeHtml(item.limitLabel)}</span>`
            : '';
          const soldOutLabel = getStwSoldOutLabel(lang);
          const soldOutOverlay = item.soldOut
            ? `<div class="sold-overlay"><span>${escapeHtml(soldOutLabel)}</span></div>`
            : '';

          return `
            <article class="card${item.soldOut ? ' sold-out' : ''}" style="${themeCss}">
              <div class="imageBox">
                ${item.iconDataUrl ? `<img src="${item.iconDataUrl}" alt="" />` : '<div class="noImage">?</div>'}
                ${qtyBadge}
              </div>
              ${soldOutOverlay}
              <div class="info">
                <h3>${escapeHtml(item.displayName)}</h3>
                ${limitBadge}
                <div class="price">
                  ${goldIconDataUrl ? `<img class="gold-icon" src="${goldIconDataUrl}" alt="" />` : ''}
                  <span>${item.price.toLocaleString(locale)}</span>
                </div>
              </div>
            </article>
          `;
        })
        .join('');

      return `
        <section class="shop-section">
          <header>
            <h2>${escapeHtml(section.titleLabel)}</h2>
            <span class="count">${section.items.length} ${ui.items}</span>
          </header>
          <div class="grid">${cards}</div>
        </section>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: fit-content;
      font-family: "Segoe UI", Tahoma, sans-serif;
      color: #f8fafc;
      background: #162032;
      position: relative;
    }
    .bg {
      position: absolute;
      inset: 0;
      background: url('${bgDataUrl}') center/cover no-repeat;
      filter: blur(1px) brightness(0.72) saturate(1.08);
      transform: scale(1.03);
    }
    .overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(18,28,44,.45) 0%, rgba(22,32,50,.62) 100%);
    }
    .content {
      position: relative;
      z-index: 1;
      width: fit-content;
      padding: 28px 40px 36px;
    }
    .top-bar {
      margin-bottom: 22px;
      border-bottom: 2px solid rgba(255,255,255,.18);
      padding-bottom: 14px;
    }
    h1 {
      font-size: 38px;
      letter-spacing: .03em;
      text-transform: uppercase;
      color: #fff;
      text-shadow: 0 2px 10px rgba(0,0,0,.45);
    }
    .meta {
      font-size: 14px;
      color: rgba(255,255,255,.72);
      margin-top: 4px;
    }
    .shops-row {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: ${SHOPS_GAP}px;
      width: fit-content;
    }
    .shop-section {
      width: fit-content;
      flex: 0 0 auto;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 16px;
      padding: 16px 18px 18px;
      backdrop-filter: blur(6px);
    }
    .shop-section header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 16px;
    }
    .shop-section h2 {
      font-size: 24px;
      color: #fff;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .count { color: rgba(255,255,255,.55); font-size: 14px; }
    .grid {
      display: grid;
      width: fit-content;
      grid-template-columns: repeat(${GRID_COLS}, ${CARD_SIZE}px);
      grid-auto-rows: ${CARD_SIZE}px;
      gap: ${CARD_GAP}px;
    }
    .card {
      position: relative;
      width: ${CARD_SIZE}px;
      height: ${CARD_SIZE}px;
      border-radius: 10px;
      overflow: hidden;
      background:
        radial-gradient(circle at 50% 12%, color-mix(in srgb, var(--card-glow) 85%, white 15%) 0%, transparent 44%),
        linear-gradient(180deg, var(--card-top) 0%, var(--card-mid) 54%, var(--card-bottom) 100%);
      box-shadow:
        inset 0 0 0 1px color-mix(in srgb, var(--card-border) 50%, transparent),
        0 6px 16px rgba(0,0,0,.28);
    }
    .card.sold-out {
      filter: grayscale(0.9) brightness(0.48) saturate(0.35);
      opacity: 0.82;
    }
    .card.sold-out .imageBox img {
      filter: grayscale(1) brightness(0.7) drop-shadow(0 4px 6px rgba(0,0,0,.35));
      opacity: 0.75;
    }
    .card.sold-out .info h3 {
      text-decoration: line-through;
      text-decoration-color: rgba(255,255,255,.55);
      color: rgba(255,255,255,.55);
    }
    .card.sold-out .price {
      opacity: 0.45;
      text-decoration: line-through;
    }
    .sold-overlay {
      position: absolute;
      inset: 0;
      z-index: 4;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,.38);
      pointer-events: none;
    }
    .sold-overlay span {
      transform: rotate(-14deg);
      background: rgba(185,28,28,.92);
      color: #fff;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 5px 14px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,.25);
      box-shadow: 0 3px 10px rgba(0,0,0,.45);
    }
    .imageBox {
      position: absolute;
      inset: 0 0 ${CARD_FOOTER}px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
    }
    .imageBox img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 8px 10px rgba(0,0,0,.42)) saturate(1.06) contrast(1.05);
    }
    .noImage {
      font-size: 56px;
      font-weight: 900;
      color: rgba(255,255,255,.45);
    }
    .qty {
      position: absolute;
      top: 6px;
      right: 6px;
      min-width: 28px;
      padding: 3px 7px;
      border-radius: 6px;
      background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(221,239,255,.92));
      color: #09316f;
      font-size: 13px;
      font-weight: 900;
    }
    .info {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      min-height: ${CARD_FOOTER}px;
      padding: 6px 8px 7px;
      background: linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.88));
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 2px;
    }
    .info h3 {
      font-size: 13px;
      line-height: 1.15;
      color: #fff;
      font-weight: 800;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .limit {
      display: inline-block;
      align-self: flex-start;
      font-size: 10px;
      font-weight: 700;
      color: #fff;
      background: rgba(0,0,0,.45);
      border: 1px solid rgba(255,255,255,.25);
      border-radius: 999px;
      padding: 1px 7px;
    }
    .price {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 5px;
      font-size: 17px;
      font-weight: 900;
      color: #ffe566;
      margin-top: 1px;
    }
    .gold-icon {
      width: 22px;
      height: 22px;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="overlay"></div>
  <div class="content">
    <div class="top-bar">
      <h1>${escapeHtml(ui.title)}</h1>
      <p class="meta">${itemCount} ${ui.items} · ${ui.refresh} 1h · ${generatedAt.toLocaleString(locale)}</p>
    </div>
    <div class="shops-row">${sectionHtml}</div>
  </div>
</body>
</html>`;
}

async function renderHtmlToPng(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const dimensions = await page.evaluate(() => ({
      width: Math.ceil(document.documentElement.scrollWidth),
      height: Math.ceil(document.documentElement.scrollHeight),
    }));

    await page.setViewport({
      width: dimensions.width,
      height: dimensions.height,
      deviceScaleFactor: 2,
    });

    const png = await page.screenshot({ fullPage: false, type: 'png' });
    return Buffer.from(png);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function generateStwShopImage(
  offers: STWShopOffer[],
  lang: SupportedLanguage,
): Promise<{ buffer: Buffer; sections: StwShopDisplaySection[] }> {
  const sections = buildStwShopSections(offers, lang);
  if (sections.every((section) => section.items.length === 0)) {
    throw new Error('No STW shop items available');
  }

  const html = buildHtml(sections, lang);
  const buffer = await renderHtmlToPng(html);
  log.epic.info(
    { lang, items: offers.length, sizeMb: (buffer.length / 1024 / 1024).toFixed(2) },
    '[STW Shop] Imagen generada',
  );
  return { buffer, sections };
}

export async function closeStwShopBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => undefined);
    sharedBrowser = null;
  }
  browserLaunchPromise = null;
}
