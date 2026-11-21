/**
 * STW loadout image — in-game style panel rendered with sharp + SVG.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { LoadoutRenderData } from '#helpers/epic/stw/loadouts/parseLoadoutData.ts';
import {
  buildLoadoutImageModel,
  type LoadoutImageModel,
  type LoadoutImageIconSlot,
} from '#helpers/epic/stw/loadouts/buildLoadoutImageModel.ts';
import { log } from '#helpers/core/logger.ts';
import {
  RENDER_SCALE,
  baselineFor,
  containBuffer,
  coverTopBuffer,
  dataUrlToBuffer,
  impactMetrics,
  measureImpactText,
  round,
  svgText,
  truncateWithEllipsis,
} from '#managers/images/stw/stwSharpRenderUtils.ts';

const WIDTH = 440;
const S = RENDER_SCALE;
const COMMANDER_MAIN_H = 70;
const COMMANDER_ABILITIES_H = 51;
const COMMANDER_PERK_H = 49;

function commanderCardHeight(commander: LoadoutImageModel['commander']): number {
  if (!commander) return 80;
  let h = COMMANDER_MAIN_H + COMMANDER_PERK_H;
  if (commander.abilities.length) h += COMMANDER_ABILITIES_H;
  return h;
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

/** Flow height including the 4px margin under every row. */
function contentHeight(model: LoadoutImageModel): number {
  let h = 12 + 31;
  h += model.commander ? commanderCardHeight(model.commander) : 80;
  if (model.teamPerk) h += 31 + 50 + 4;
  if (model.support.length) h += 31 + model.support.length * (54 + 4);
  if (model.gadgets.length) h += 31 + model.gadgets.length * (50 + 4);
  return h + 14;
}

function commanderBannerColor(rarityClass: string | undefined): string {
  if (rarityClass === 'mythic') return '#c9ae2d';
  if (rarityClass === 'legendary') return '#ec831f';
  if (rarityClass === 'epic') return '#9b59b6';
  return '#2e6db4';
}

const HERO_SIDE_GRADIENTS: Record<string, [string, string]> = {
  legendary: ['#c7661b', '#ed7f1c'],
  mythic: ['#9a7b18', '#c9ae2d'],
  epic: ['#6b3f8f', '#9b59b6'],
  rare: ['#1e4f8f', '#2e6db4'],
  uncommon: ['#3d8b40', '#5cb85c'],
};

const COMMANDER_SIDE_GRADIENTS: Record<string, [string, string]> = {
  legendary: ['#c36b1f', '#ec831f'],
  mythic: ['#9a7b18', '#c9ae2d'],
  epic: ['#6b3f8f', '#9b59b6'],
  rare: ['#1e4f8f', '#2e6db4'],
};

const BOLT_ADVANCE = 34.328125; // Segoe UI Emoji ⚡ at 25px
const BOLT_ADVANCE_13 = 17.849609375;

function backgroundSvg(height: number): Buffer {
  const w = WIDTH * S;
  const h = height * S;
  const blueCx = 0.25 * w;
  const blueCy = 0.15 * h;
  const blueR = Math.hypot(w - blueCx, h - blueCy);
  const goldCx = 0.8 * w;
  const goldCy = 0.65 * h;
  const goldR = Math.hypot(goldCx, goldCy);
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="gold" gradientUnits="userSpaceOnUse" cx="${round(goldCx)}" cy="${round(goldCy)}" r="${round(goldR)}">
        <stop offset="0%" stop-color="rgba(190,150,70,0.25)"/>
        <stop offset="40%" stop-color="rgba(190,150,70,0)"/>
      </radialGradient>
      <radialGradient id="blue" gradientUnits="userSpaceOnUse" cx="${round(blueCx)}" cy="${round(blueCy)}" r="${round(blueR)}">
        <stop offset="0%" stop-color="rgba(80,150,190,0.35)"/>
        <stop offset="35%" stop-color="rgba(80,150,190,0)"/>
      </radialGradient>
      <linearGradient id="shade" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(16,28,48,0.92)"/>
        <stop offset="100%" stop-color="rgba(9,26,31,0.93)"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="#162533"/>
    <rect width="${w}" height="${h}" fill="url(#gold)"/>
    <rect width="${w}" height="${h}" fill="url(#blue)"/>
    <rect width="${w}" height="${h}" fill="url(#shade)"/>
  </svg>`);
}

function sideGradientSvg(
  x: number,
  y: number,
  width: number,
  height: number,
  colors: [string, string],
): string {
  const [edge, fill] = colors;
  return `<rect x="${round(x * S)}" y="${round(y * S)}" width="${round(width * S)}" height="${round(height * S)}" fill="${fill}"/>
    <rect x="${round(x * S)}" y="${round(y * S)}" width="${round(10 * S)}" height="${round(height * S)}" fill="${edge}"/>`;
}

function sheenSvg(cardX: number, cardY: number, cardH: number): Buffer {
  const x = cardX * S;
  const y = cardY * S;
  const w = 412 * S;
  const h = cardH * S;
  return Buffer.from(`<svg width="${round(w)}" height="${round(h)}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sheen" x1="-0.78%" y1="5.2%" x2="100.78%" y2="94.8%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.12)"/>
        <stop offset="42%" stop-color="rgba(255,255,255,0)"/>
      </linearGradient>
    </defs>
    <rect width="${round(w)}" height="${round(h)}" fill="url(#sheen)"/>
  </svg>`);
}

interface LoadoutLayout {
  height: number;
  cardTop: number;
  cardH: number;
  abilitiesTop: number | null;
  perkTop: number;
  teamTitleTop: number | null;
  teamRowTop: number | null;
  supportTitleTop: number | null;
  supportRowTops: number[];
  gadgetTitleTop: number | null;
  gadgetRowTops: number[];
}

function layoutLoadout(model: LoadoutImageModel): LoadoutLayout {
  const height = Math.max(contentHeight(model), estimateHeight(model));
  const cardTop = 43;
  const cardH = model.commander ? commanderCardHeight(model.commander) : 80;
  let cursor = cardTop + cardH;
  const abilitiesTop = model.commander?.abilities.length ? cardTop + COMMANDER_MAIN_H : null;
  const perkTop = model.commander ? cardTop + COMMANDER_MAIN_H + (abilitiesTop === null ? 0 : COMMANDER_ABILITIES_H) : cardTop;
  let teamTitleTop: number | null = null;
  let teamRowTop: number | null = null;
  if (model.teamPerk) {
    teamTitleTop = cursor;
    teamRowTop = cursor + 31;
    cursor += 31 + 50 + 4;
  }
  let supportTitleTop: number | null = null;
  const supportRowTops: number[] = [];
  if (model.support.length) {
    supportTitleTop = cursor;
    cursor += 31;
    for (let i = 0; i < model.support.length; i++) {
      supportRowTops.push(cursor);
      cursor += 54 + 4;
    }
  }
  let gadgetTitleTop: number | null = null;
  const gadgetRowTops: number[] = [];
  if (model.gadgets.length) {
    gadgetTitleTop = cursor;
    cursor += 31;
    for (let i = 0; i < model.gadgets.length; i++) {
      gadgetRowTops.push(cursor);
      cursor += 50 + 4;
    }
  }
  return { height, cardTop, cardH, abilitiesTop, perkTop, teamTitleTop, teamRowTop, supportTitleTop, supportRowTops, gadgetTitleTop, gadgetRowTops };
}

function buildRowBackgroundSvg(model: LoadoutImageModel, layout: LoadoutLayout): Buffer {
  const h = layout.height;
  const parts: string[] = [];
  const cardX = 14;
  const cardW = 412;
  const cardY = layout.cardTop;
  const cardH = layout.cardH;

  if (model.commander) {
    const banner = commanderBannerColor(model.commander.rarityClass);
    const end = `rgb(${Math.round(Number.parseInt(banner.slice(1, 3), 16) * 0.78)},${Math.round(Number.parseInt(banner.slice(3, 5), 16) * 0.78)},${Math.round(Number.parseInt(banner.slice(5, 7), 16) * 0.78)})`;
    parts.push(`<defs><linearGradient id="cmd-bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${banner}" stop-opacity="0.93"/>
      <stop offset="100%" stop-color="${end}"/>
    </linearGradient></defs>`);
    parts.push(`<rect x="${cardX * S}" y="${cardY * S}" width="${cardW * S}" height="${cardH * S}" fill="url(#cmd-bg)"/>`);
    if (layout.abilitiesTop !== null) {
      parts.push(`<rect x="${cardX * S}" y="${layout.abilitiesTop * S}" width="${cardW * S}" height="${COMMANDER_ABILITIES_H * S}" fill="rgba(144,63,11,0.38)"/>`);
    }
    parts.push(`<rect x="${cardX * S}" y="${layout.perkTop * S}" width="${cardW * S}" height="${COMMANDER_PERK_H * S}" fill="rgba(62,71,72,0.8)"/>`);
    parts.push(`<rect x="${cardX * S}" y="${layout.perkTop * S}" width="${51 * S}" height="${49 * S}" fill="rgba(255,255,255,0.1)"/>`);
    const side = COMMANDER_SIDE_GRADIENTS[model.commander.rarityClass] ?? COMMANDER_SIDE_GRADIENTS.legendary!;
    parts.push(sideGradientSvg(cardX + cardW - 92, layout.perkTop, 92, 49, side));
  } else {
    parts.push(`<rect x="${cardX * S}" y="${cardY * S}" width="${cardW * S}" height="${cardH * S}" fill="rgba(0,0,0,0.3)"/>`);
  }

  if (layout.teamRowTop !== null) {
    // `.slot-row` is declared after `.team-row`, so its flat background wins over the gradient.
    parts.push(`<rect x="${cardX * S}" y="${layout.teamRowTop * S}" width="${cardW * S}" height="${50 * S}" fill="rgba(96,107,102,0.68)"/>`);
    parts.push(`<rect x="${cardX * S}" y="${layout.teamRowTop * S}" width="${S}" height="${50 * S}" fill="rgba(255,255,255,0.12)"/>`);
    parts.push(`<rect x="${(cardX + 1) * S}" y="${layout.teamRowTop * S}" width="${51 * S}" height="${50 * S}" fill="rgba(255,255,255,0.1)"/>`);
  }

  for (let i = 0; i < layout.supportRowTops.length; i++) {
    const top = layout.supportRowTops[i]!;
    const row = model.support[i]!;
    parts.push(`<rect x="${cardX * S}" y="${top * S}" width="${cardW * S}" height="${54 * S}" fill="rgba(96,107,102,0.68)"/>`);
    parts.push(`<rect x="${cardX * S}" y="${top * S}" width="${S}" height="${54 * S}" fill="rgba(255,255,255,0.12)"/>`);
    parts.push(`<rect x="${(cardX + 1) * S}" y="${top * S}" width="${51 * S}" height="${54 * S}" fill="rgba(255,255,255,0.1)"/>`);
    const side = HERO_SIDE_GRADIENTS[row.rarityClass] ?? HERO_SIDE_GRADIENTS.legendary!;
    parts.push(sideGradientSvg(cardX + cardW - 93, top, 93, 54, side));
  }

  for (let i = 0; i < layout.gadgetRowTops.length; i++) {
    const top = layout.gadgetRowTops[i]!;
    parts.push(`<rect x="${cardX * S}" y="${top * S}" width="${cardW * S}" height="${50 * S}" fill="rgba(100,113,106,0.68)"/>`);
    parts.push(`<rect x="${cardX * S}" y="${top * S}" width="${S}" height="${50 * S}" fill="rgba(255,255,255,0.12)"/>`);
    parts.push(`<rect x="${(cardX + 1) * S}" y="${top * S}" width="${51 * S}" height="${50 * S}" fill="rgba(255,255,255,0.1)"/>`);
  }

  return Buffer.from(`<svg width="${WIDTH * S}" height="${h * S}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`);
}

async function loadImage(src: string): Promise<Buffer | null> {
  if (src.startsWith('data:')) return dataUrlToBuffer(src);
  try {
    return fs.readFileSync(src);
  } catch {
    return null;
  }
}

async function buildIcons(model: LoadoutImageModel, layout: LoadoutLayout): Promise<sharp.OverlayOptions[]> {
  const layers: sharp.OverlayOptions[] = [];
  const cardX = 14;
  const cardW = 412;

  const pushContained = async (slot: LoadoutImageIconSlot | null, x: number, y: number, size: number) => {
    if (!slot) return;
    const raw = await loadImage(slot.src);
    if (!raw) return;
    try {
      const contained = await containBuffer(raw, size * S, size * S);
      layers.push({
        input: contained.buffer,
        left: Math.round((x + contained.offsetX) * S),
        top: Math.round((y + contained.offsetY) * S),
      });
    } catch {
      // Placeholder/unreadable icon: leave the box background visible.
    }
  };

  if (model.commander) {
    const commander = model.commander;
    if (layout.abilitiesTop !== null) {
      const count = commander.abilities.length;
      const startX = cardX + cardW - 16 - count * 36 - (count - 1) * 10;
      for (let i = 0; i < count; i++) {
        await pushContained(commander.abilities[i]!, startX + i * 46, layout.abilitiesTop + 7.5, 36);
      }
    }
    await pushContained(commander.commanderPerk, cardX + 7, layout.perkTop + 6, 37);
    if (commander.portraitSrc) {
      const raw = await loadImage(commander.portraitSrc);
      if (raw) {
        try {
          layers.push({
            input: await coverTopBuffer(raw, 62 * S, 49 * S),
            left: (cardX + cardW - 3 - 62) * S,
            top: layout.perkTop * S,
          });
        } catch {
          // ignore unreadable portrait
        }
      }
    }
  }

  if (model.teamPerk && layout.teamRowTop !== null) {
    await pushContained(model.teamPerk, cardX + 1 + 7, layout.teamRowTop + 6.5, 37);
  }

  for (let i = 0; i < model.support.length; i++) {
    const row = model.support[i]!;
    const top = layout.supportRowTops[i]!;
    await pushContained(row.heroPerk, cardX + 1 + 7, top + 8.5, 37);
    const raw = await loadImage(row.portraitSrc);
    if (raw) {
      try {
        layers.push({
          input: await coverTopBuffer(raw, 72 * S, 54 * S),
          left: (cardX + cardW - 3 - 72) * S,
          top: top * S,
        });
      } catch {
        // ignore unreadable portrait
      }
    }
  }

  for (let i = 0; i < model.gadgets.length; i++) {
    const top = layout.gadgetRowTops[i]!;
    await pushContained(model.gadgets[i]!, cardX + 1 + 6.5, top + 6, 38);
  }

  return layers;
}

function buildTextSvg(model: LoadoutImageModel, layout: LoadoutLayout): Buffer {
  const parts: string[] = [];
  const cardX = 14;
  const cardW = 412;
  const cardY = layout.cardTop;
  const title = model.ui.commander.toUpperCase();

  const top18 = impactMetrics(18);
  parts.push(`<g><g transform="translate(0,${2 * S})">${svgText({ text: title, x: (WIDTH / 2) * S, y: baselineFor(12, 22, top18) * S, font: 'impact', fontSize: 18 * S, fill: 'rgba(0,0,0,0.35)', anchor: 'middle', letterSpacing: 0.5 * S, italic: true })}</g>
    ${svgText({ text: title, x: (WIDTH / 2) * S, y: baselineFor(12, 22, top18) * S, font: 'impact', fontSize: 18 * S, fill: '#d9d9e8', anchor: 'middle', letterSpacing: 0.5 * S, italic: true })}</g>`);

  if (model.commander) {
    const commander = model.commander;
    const powerDigits = String(commander.power);
    const powerW = BOLT_ADVANCE + 4 + measureImpactText(powerDigits, 27);
    const rightX = cardX + cardW - 12;
    const nameMax = cardW - 24 - powerW - 10;
    const name = truncateWithEllipsis(
      commander.name,
      nameMax,
      (value) => measureImpactText(value, 26),
    );
    const nameBaseline = baselineFor(cardY + 11 + 2, 27.3, impactMetrics(26));
    parts.push(svgText({
      text: name,
      x: rightX * S,
      y: nameBaseline * S,
      font: 'impact',
      fontSize: 26 * S,
      fill: '#ffffff',
      anchor: 'end',
    }));

    const rarityBaseline = cardY + 11 + 2 + 27.3 + 6 + 15;
    const rest = `${commander.rarityLabel} | ${commander.classLabel}`;
    const restW = measureImpactText(rest, 15);
    parts.push(svgText({
      text: rest,
      x: rightX * S,
      y: rarityBaseline * S,
      font: 'impact',
      fontSize: 15 * S,
      fill: 'rgba(255,210,160,0.95)',
      anchor: 'end',
    }));
    const starsText = '★'.repeat(Math.min(5, Math.max(0, commander.stars)));
    parts.push(svgText({
      text: starsText,
      x: (rightX - restW - 7) * S,
      y: rarityBaseline * S,
      font: 'impact',
      fontSize: 13 * S,
      fill: '#ffffff',
      anchor: 'end',
      letterSpacing: 2 * S,
    }));

    const powerTop = cardY + 11;
    parts.push(svgText({
      text: powerDigits,
      x: (cardX + 12 + BOLT_ADVANCE + 4) * S,
      y: (powerTop + 2 + 24) * S,
      font: 'impact',
      fontSize: 27 * S,
      fill: '#ffffff',
    }));
    parts.push(`<g>${boltSvg(30, powerTop + 5.5, 26, 18)}</g>`);

    if (layout.abilitiesTop !== null) {
      const baseline = layout.abilitiesTop + 31;
      parts.push(svgText({
        text: model.ui.heroAbilities.toUpperCase(),
        x: (cardX + 20) * S,
        y: baseline * S,
        font: 'impact',
        fontSize: 14 * S,
        fill: '#fb7b13',
        letterSpacing: 0.4 * S,
      }));
    }

    const perkNameMax = cardW - 51 - 92 - 9 - 8;
    const perkName = truncateWithEllipsis(
      commander.commanderPerk?.name ?? '',
      perkNameMax,
      (value) => measureImpactText(value, 15),
    );
    parts.push(svgText({
      text: perkName,
      x: (cardX + 51 + 9) * S,
      y: (layout.perkTop + 30.5) * S,
      font: 'impact',
      fontSize: 15 * S,
      fill: '#f7f7f7',
    }));
  } else {
    parts.push(svgText({
      text: model.ui.noCommander.toUpperCase(),
      x: (WIDTH / 2) * S,
      y: (layout.cardTop + 45.5) * S,
      font: 'impact',
      fontSize: 14 * S,
      fill: '#aaaaaa',
      anchor: 'middle',
    }));
  }

  const sectionTitle = (text: string, top: number) => {
    const baseline = top + 23;
    return `<g><g transform="translate(0,${2 * S})">${svgText({ text, x: (WIDTH / 2) * S, y: baseline * S, font: 'impact', fontSize: 17 * S, fill: 'rgba(0,0,0,0.4)', anchor: 'middle', italic: true })}</g>
      ${svgText({ text, x: (WIDTH / 2) * S, y: baseline * S, font: 'impact', fontSize: 17 * S, fill: '#d9d9e8', anchor: 'middle', italic: true })}</g>`;
  };

  if (layout.teamRowTop !== null && layout.teamTitleTop !== null) {
    parts.push(sectionTitle(model.ui.teamPerk.toUpperCase(), layout.teamTitleTop));
    if (model.teamPerk) {
      const name = truncateWithEllipsis(
        model.teamPerk.name.toUpperCase(),
        cardW - 51 - 9,
        (value) => measureImpactText(value, 14),
      );
      const baseline = layout.teamRowTop + 30.5;
      parts.push(`<g transform="translate(0,${S})">${svgText({ text: name, x: (cardX + 1 + 51 + 9) * S, y: baseline * S, font: 'impact', fontSize: 14 * S, fill: 'rgba(0,0,0,0.5)' })}</g>`);
      parts.push(svgText({ text: name, x: (cardX + 1 + 51 + 9) * S, y: baseline * S, font: 'impact', fontSize: 14 * S, fill: '#ffffff' }));
    }
  }

  if (layout.supportTitleTop !== null) {
    parts.push(sectionTitle(model.ui.supportTeam.toUpperCase(), layout.supportTitleTop));
    for (let i = 0; i < model.support.length; i++) {
      const row = model.support[i]!;
      const rowTop = layout.supportRowTops[i]!;
      const perkName = row.heroPerk?.name ?? '';
      const prefix = `${model.ui.level} ${row.level} · `;
      const powerText = `${row.power}`;
      const prefixW = measureImpactText(prefix, 13, { letterSpacing: 0.3 });
      const powerW = measureImpactText(powerText, 13, { letterSpacing: 0.3 });
      const totalW = prefixW + BOLT_ADVANCE_13 + 3.61 + powerW;
      const labelMax = cardW - 1 - 51 - 93 - (totalW + 10) - 9 - 8;
      parts.push(svgText({
        text: truncateWithEllipsis(perkName, labelMax, (value) => measureImpactText(value, 15)),
        x: (cardX + 1 + 51 + 9) * S,
        y: (rowTop + 33) * S,
        font: 'impact',
        fontSize: 15 * S,
        fill: '#f7f7f7',
      }));

      const powerRight = cardX + cardW - 93 - 10;
      const startX = powerRight - totalW;
      const baseline = rowTop + 32;
      parts.push(svgText({ text: prefix, x: startX * S, y: baseline * S, font: 'impact', fontSize: 13 * S, fill: '#c5d0d8', letterSpacing: 0.3 * S }));
      parts.push(boltSvg(startX + prefixW + 3.1, rowTop + 22, 12.8, 12.3));
      parts.push(svgText({ text: powerText, x: (startX + prefixW + BOLT_ADVANCE_13 + 3.61) * S, y: baseline * S, font: 'impact', fontSize: 13 * S, fill: '#c5d0d8', letterSpacing: 0.3 * S }));
    }
  }

  if (layout.gadgetTitleTop !== null) {
    parts.push(sectionTitle(model.ui.gadgets.toUpperCase(), layout.gadgetTitleTop));
    for (let i = 0; i < model.gadgets.length; i++) {
      const row = model.gadgets[i]!;
      const rowTop = layout.gadgetRowTops[i]!;
      const name = row.name.toUpperCase();
      parts.push(`<g transform="translate(0,${S})">${svgText({ text: name, x: (cardX + 1 + 51) * S, y: (rowTop + 30.5) * S, font: 'impact', fontSize: 14 * S, fill: 'rgba(0,0,0,0.5)' })}</g>`);
      parts.push(svgText({ text: name, x: (cardX + 1 + 51) * S, y: (rowTop + 30.5) * S, font: 'impact', fontSize: 14 * S, fill: '#f3f3f3' }));
    }
  }

  return Buffer.from(`<svg width="${WIDTH * S}" height="${layout.height * S}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`);
}

function boltSvg(x: number, y: number, w: number, h: number): string {
  return `<g transform="translate(${round(x * S)},${round(y * S)}) scale(${round((w * S) / 26.8)},${round((h * S) / 26.8)})">
    <defs><linearGradient id="bolt-g-${round(x)}-${round(y)}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd83d"/><stop offset="0.55" stop-color="#ffb02e"/><stop offset="1" stop-color="#ff7a1a"/>
    </linearGradient></defs>
    <path d="M13.5 0 6.2 14.2h4.5L8.8 26.8l11-15.6h-6.3z" fill="url(#bolt-g-${round(x)}-${round(y)})" stroke="#f4a12a" stroke-width="0.6" stroke-linejoin="round"/>
  </g>`;
}

async function renderLoadoutToBuffer(model: LoadoutImageModel): Promise<Buffer> {
  const layout = layoutLoadout(model);
  const width = WIDTH * S;
  const height = layout.height * S;
  const layers: sharp.OverlayOptions[] = [
    { input: backgroundSvg(layout.height), left: 0, top: 0 },
    { input: buildRowBackgroundSvg(model, layout), left: 0, top: 0 },
  ];
  layers.push(...(await buildIcons(model, layout)));
  layers.push({ input: buildTextSvg(model, layout), left: 0, top: 0 });
  if (model.commander) layers.push({ input: sheenSvg(14, layout.cardTop, layout.cardH), left: 14 * S, top: layout.cardTop * S });

  return sharp({
    create: { width, height, channels: 4, background: { r: 22, g: 37, b: 51, alpha: 255 } },
  })
    .composite(layers)
    .png()
    .toBuffer();
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
    const buffer = await renderLoadoutToBuffer(model);

    fs.mkdirSync(savePath, { recursive: true });

    const fileName = opts.fileName ?? `loadout_${Date.now()}.png`;
    const outPath = path.join(savePath, fileName);
    fs.writeFileSync(outPath, buffer);

    return { success: true, path: outPath, fileName };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.commands.warn({ err: message }, '[STW LoadoutImage] render failed');
    return { success: false, error: message };
  }
}
