/**
 * STW loadout image — in-game style panel (Playwright / puppeteer-core).
 */

import fs from 'fs';
import path from 'path';
import puppeteer, { type Browser } from 'puppeteer-core';
import type { LoadoutRenderData } from '#helpers/epic/stw/loadouts/parseLoadoutData.ts';
import {
  buildLoadoutImageModel,
  type LoadoutImageModel,
  type LoadoutImageSupportSlot,
} from '#helpers/epic/stw/loadouts/buildLoadoutImageModel.ts';
import {
  PUPPETEER_LAUNCH_ARGS,
  resolvePuppeteerChromeExecutable,
} from '#helpers/core/browser/puppeteerChrome.ts';
import { log } from '#helpers/core/logger.ts';

const WIDTH = 440;
const COMMANDER_MAIN_H = 70;
const COMMANDER_ABILITIES_H = 51;
const COMMANDER_PERK_H = 49;

function commanderCardHeight(commander: LoadoutImageModel['commander']): number {
  if (!commander) return 80;
  let h = COMMANDER_MAIN_H + COMMANDER_PERK_H;
  if (commander.abilities.length) h += COMMANDER_ABILITIES_H;
  return h;
}

let sharedBrowser: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser?.connected) return sharedBrowser;
  if (!browserLaunchPromise) {
    browserLaunchPromise = puppeteer
      .launch({
        executablePath: resolvePuppeteerChromeExecutable(),
        headless: true,
        args: PUPPETEER_LAUNCH_ARGS,
      })
      .catch((err) => {
        browserLaunchPromise = null;
        sharedBrowser = null;
        throw err;
      });
  }
  sharedBrowser = await browserLaunchPromise;
  browserLaunchPromise = null;
  return sharedBrowser;
}

function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function img(src: string, className: string, alt = ''): string {
  return `<img class="${className}" src="${esc(src)}" alt="${esc(alt)}">`;
}

function stars(count: number): string {
  return '★'.repeat(Math.min(5, Math.max(0, count)));
}

function estimateHeight(model: LoadoutImageModel): number {
  let h = 12 + 31; // Commander title + card
  if (model.commander) h += commanderCardHeight(model.commander);
  else h += 80;
  if (model.teamPerk) h += 31 + 50;
  if (model.support.length) h += 31 + model.support.length * 54;
  if (model.gadgets.length) h += 31 + model.gadgets.length * 54;
  return Math.max(220, h + 20);
}

function supportRow(item: LoadoutImageSupportSlot, levelLabel: string): string {
  const perkIcon = item.heroPerk
    ? `<div class="perk-icon support-perk-icon">${img(item.heroPerk.src, 'icon-img', item.heroPerk.name)}</div>`
    : `<div class="perk-icon support-perk-icon support-perk-empty"></div>`;

  return `
    <div class="slot-row support-row">
      ${perkIcon}
      <div class="perk-name support-perk-label">${esc(item.heroPerk?.name ?? '')}</div>
      <div class="support-power">${esc(levelLabel)} ${item.level} · ⚡ ${item.power}</div>
      <div class="hero-side ${esc(item.rarityClass)}">
        ${img(item.portraitSrc, 'hero-img', item.name)}
      </div>
    </div>
  `;
}

function renderHtml(model: LoadoutImageModel): string {
  const height = estimateHeight(model);
  const commander = model.commander;
  const bannerColor = commander
    ? commander.rarityClass === 'mythic'
      ? '#c9ae2d'
      : commander.rarityClass === 'legendary'
        ? '#ec831f'
        : commander.rarityClass === 'epic'
          ? '#9b59b6'
          : '#2e6db4'
    : '#ec831f';

  const commanderAbilitiesHtml = commander?.abilities.length
    ? commander.abilities.map((a) => `
            <div class="ability">${img(a.src, 'ability-img', a.name)}</div>
          `).join('')
    : '';

  const commanderHtml = commander
    ? `
    <div class="commander-card" style="--cmd-banner:${bannerColor};height:${commanderCardHeight(commander)}px">
      <div class="commander-main">
        <div class="power"><span>⚡</span>${esc(String(commander.power))}</div>
        <div class="commander-info-right">
          <div class="commander-name">${esc(commander.name)}</div>
          <div class="rarity-line">
            <span class="stars">${stars(commander.stars)}</span>
            ${esc(commander.rarityLabel)} | ${esc(commander.classLabel)}
          </div>
        </div>
      </div>
      ${commanderAbilitiesHtml ? `
      <div class="abilities-title">
        <span>${esc(model.ui.heroAbilities)}</span>
        <div class="abilities">${commanderAbilitiesHtml}</div>
      </div>` : ''}
      <div class="commander-perk">
        ${commander.commanderPerk ? `<div class="perk-icon">${img(commander.commanderPerk.src, 'icon-img', commander.commanderPerk.name)}</div>` : ''}
        <div class="perk-name">${esc(commander.commanderPerk?.name ?? '')}</div>
        <div class="commander-portrait-side ${esc(commander.rarityClass)}">
          ${img(commander.portraitSrc, 'commander-hero', commander.name)}
        </div>
      </div>
    </div>`
    : `<div class="empty-commander">${esc(model.ui.noCommander)}</div>`;

  const teamPerkHtml = model.teamPerk
    ? `
    <div class="section-title">${esc(model.ui.teamPerk)}</div>
    <div class="slot-row team-row">
      <div class="slot-icon">${img(model.teamPerk.src, 'icon-img', model.teamPerk.name)}</div>
      <div class="slot-name">${esc(model.teamPerk.name)}</div>
    </div>`
    : '';

  const supportHtml = model.support.length
    ? `
    <div class="section-title">${esc(model.ui.supportTeam)}</div>
    ${model.support.map((row) => supportRow(row, model.ui.level)).join('')}`
    : '';

  const gadgetsHtml = model.gadgets.length
    ? `
    <div class="section-title">${esc(model.ui.gadgets)}</div>
    ${model.gadgets.map((g) => `
      <div class="slot-row gadget-row">
        <div class="slot-icon gadget-icon">${img(g.src, 'icon-img', g.name)}</div>
        <div class="slot-name">${esc(g.name)}</div>
      </div>
    `).join('')}`
    : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    width: ${WIDTH}px;
    min-height: ${height}px;
    background: transparent;
  }
  body {
    font-family: Impact, "Arial Black", system-ui, sans-serif;
    color: white;
    text-transform: uppercase;
  }
  #loadout {
    position: relative;
    width: ${WIDTH}px;
    min-height: ${height}px;
    overflow: hidden;
    padding: 12px 14px 14px;
    background:
      linear-gradient(180deg, rgba(16, 28, 48, .92), rgba(9, 26, 31, .93)),
      radial-gradient(circle at 25% 15%, rgba(80, 150, 190, .35), transparent 35%),
      radial-gradient(circle at 80% 65%, rgba(190, 150, 70, .25), transparent 40%),
      #162533;
  }
  .top-title, .section-title, .commander-card, .slot-row { position: relative; z-index: 1; }
  .top-title {
    height: 31px; text-align: center; font-size: 18px; font-style: italic;
    letter-spacing: .5px; color: #d9d9e8;
    text-shadow: 0 2px 0 rgba(0,0,0,.35);
  }
  .commander-card {
    display: flex;
    flex-direction: column;
    background: linear-gradient(90deg, color-mix(in srgb, var(--cmd-banner) 93%, transparent), color-mix(in srgb, var(--cmd-banner) 78%, #000));
    overflow: hidden;
    position: relative;
  }
  .commander-card::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(110deg, rgba(255,255,255,.12), transparent 42%);
    pointer-events: none;
  }
  .commander-main {
    position: relative;
    height: 70px;
    padding: 11px 12px;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .power {
    flex-shrink: 0;
    font-size: 27px;
    line-height: 1;
    padding-top: 2px;
  }
  .power span { font-size: 25px; margin-right: 4px; }
  .commander-info-right {
    flex: 1;
    min-width: 0;
    text-align: right;
    padding-top: 2px;
  }
  .commander-name {
    font-size: 26px;
    line-height: 1.05;
    text-transform: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rarity-line {
    margin-top: 6px;
    font-size: 15px;
    color: #ffd2a0;
    text-transform: none;
    opacity: .95;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stars { color: white; letter-spacing: 2px; font-size: 13px; margin-right: 7px; }
  .abilities-title {
    position: relative;
    z-index: 2;
    height: 51px;
    padding: 11px 16px 11px 20px;
    background: rgba(144, 63, 11, .38);
    color: #fb7b13;
    font-size: 14px;
    letter-spacing: .4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .abilities-title > span { flex-shrink: 0; }
  .abilities {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-shrink: 0;
    margin-left: auto;
  }
  .ability {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }
  .ability-img {
    width: 36px;
    height: 36px;
    object-fit: contain;
    display: block;
  }
  .ability.small .ability-img {
    width: 32px;
    height: 32px;
  }
  .commander-perk {
    height: 49px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    background: rgba(62, 71, 72, .8);
    z-index: 2;
  }
  .perk-icon {
    width: 51px;
    height: 49px;
    display: grid;
    place-items: center;
    background: rgba(255,255,255,.1);
    flex-shrink: 0;
  }
  .perk-icon .icon-img {
    width: 37px;
    height: 37px;
    object-fit: contain;
  }
  .perk-name {
    padding-left: 9px;
    padding-right: 8px;
    font-size: 15px;
    color: #f7f7f7;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: none;
  }
  .commander-perk .commander-portrait-side {
    position: relative;
    width: 92px;
    height: 49px;
    flex-shrink: 0;
    background: linear-gradient(90deg, #c36b1f 0 10px, #ec831f 10px);
    overflow: hidden;
  }
  .commander-portrait-side.legendary {
    background: linear-gradient(90deg, #c36b1f 0 10px, #ec831f 10px);
  }
  .commander-portrait-side.mythic {
    background: linear-gradient(90deg, #9a7b18 0 10px, #c9ae2d 10px);
  }
  .commander-portrait-side.epic {
    background: linear-gradient(90deg, #6b3f8f 0 10px, #9b59b6 10px);
  }
  .commander-portrait-side.rare {
    background: linear-gradient(90deg, #1e4f8f 0 10px, #2e6db4 10px);
  }
  .commander-perk .commander-hero {
    position: absolute;
    right: 3px;
    bottom: 0;
    width: 62px;
    height: 49px;
    object-fit: cover;
    object-position: top center;
  }
  .section-title {
    height: 31px; display: flex; align-items: end; justify-content: center;
    padding-bottom: 4px; font-size: 17px; font-style: italic;
    color: #d9d9e8; text-shadow: 0 2px 0 rgba(0,0,0,.4);
  }
  .team-row {
    height: 50px; display: flex; align-items: center;
    background: linear-gradient(90deg, rgba(72,92,97,.88), #4b43ff 36%, #00d2e8 100%);
  }
  .slot-row {
    height: 50px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    background: rgba(96, 107, 102, .68);
    border-left: 1px solid rgba(255,255,255,.12);
    overflow: visible;
  }
  .support-row {
    height: 54px;
    overflow: hidden;
    display: flex;
    align-items: center;
  }
  .support-row .perk-icon {
    width: 51px;
    height: 54px;
    background: rgba(255,255,255,.1);
  }
  .support-row .support-perk-empty {
    background: rgba(255,255,255,.05);
  }
  .support-row .support-perk-label {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    color: #f7f7f7;
    padding-left: 9px;
    padding-right: 8px;
  }
  .support-power {
    flex-shrink: 0;
    padding-right: 10px;
    font-size: 13px;
    color: #c5d0d8;
    letter-spacing: .3px;
    text-transform: none;
    white-space: nowrap;
  }
  .slot-icon {
    width: 51px; height: 50px; display: grid; place-items: center;
    background: rgba(255,255,255,.1); flex-shrink: 0;
  }
  .slot-meta { flex: 1; padding-left: 8px; min-width: 0; text-transform: none; }
  .slot-sub { font-size: 12px; color: #c5d0d8; margin-top: 2px; letter-spacing: .3px; }
  .icon-img { width: 37px; height: 37px; object-fit: contain; }
  .class-badge-img { width: 26px; height: 26px; object-fit: contain; }
  .slot-name {
    font-size: 14px; color: #f3f3f3;
    text-shadow: 0 1px 0 rgba(0,0,0,.5);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .team-row .slot-name { flex: 1; padding-left: 9px; color: white; }
  .hero-side {
    width: 93px; height: 50px; position: relative; overflow: hidden; flex-shrink: 0;
    background: linear-gradient(90deg, #c7661b 0 10px, #ed7f1c 10px);
  }
  .support-row .hero-side {
    height: 54px;
    width: 93px;
  }
  .hero-side.legendary { background: linear-gradient(90deg, #c7661b 0 10px, #ed7f1c 10px); }
  .hero-side.mythic { background: linear-gradient(90deg, #9a7b18 0 10px, #c9ae2d 10px); }
  .hero-side.epic { background: linear-gradient(90deg, #6b3f8f 0 10px, #9b59b6 10px); }
  .hero-side.rare { background: linear-gradient(90deg, #1e4f8f 0 10px, #2e6db4 10px); }
  .hero-side.uncommon { background: linear-gradient(90deg, #3d8b40 0 10px, #5cb85c 10px); }
  .class-badge {
    position: absolute; left: 0; top: 7px; width: 28px; height: 28px; z-index: 2;
    border-radius: 50%; overflow: hidden; background: #d16b16;
  }
  .hero-img {
    position: absolute; right: 3px; bottom: 0; width: 72px; height: 54px; object-fit: cover;
    object-position: top center;
  }
  .gadget-row { background: rgba(100, 113, 106, .68); }
  .gadget-icon .icon-img { width: 38px; height: 38px; }
  .empty-commander {
    height: 80px; display: grid; place-items: center;
    background: rgba(0,0,0,.3); color: #aaa; font-size: 14px;
  }
</style>
</head>
<body>
  <div id="loadout">
    <div class="top-title">${esc(model.ui.commander)}</div>
    ${commanderHtml}
    ${teamPerkHtml}
    ${supportHtml}
    ${gadgetsHtml}
  </div>
</body>
</html>`;
}

export interface GenerateStwLoadoutImageOptions {
  data: LoadoutRenderData;
  savePath: string;
  fileName?: string;
}

export async function generateStwLoadoutImage(
  opts: GenerateStwLoadoutImageOptions,
): Promise<{ success: boolean; path?: string; fileName?: string; error?: string }> {
  const { data, savePath } = opts;
  try {
    const model = buildLoadoutImageModel(data);
    const html = renderHtml(model);
    const height = estimateHeight(model);

    fs.mkdirSync(savePath, { recursive: true });
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    const fileName = opts.fileName ?? `loadout_${Date.now()}.png`;
    const outPath = path.join(savePath, fileName);
    const el = await page.$('#loadout');
    if (!el) throw new Error('Loadout root element not found');
    await el.screenshot({ path: outPath as `${string}.png`, omitBackground: true });
    await page.close();

    return { success: true, path: outPath, fileName };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.commands.warn({ err: message }, '[STW LoadoutImage] render failed');
    return { success: false, error: message };
  }
}
