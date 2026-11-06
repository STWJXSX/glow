import fs from 'fs';
import path from 'path';
import { createCanvas, registerFont, type CanvasRenderingContext2D as NodeCanvasCtx } from 'canvas';
import sharp from 'sharp';
import {
  LOCKER_LABEL_FONT_SIZE,
  LOCKER_LABEL_MAX_LINES,
  LOCKER_LABEL_MIN_FONT_SIZE,
  LOCKER_LABEL_MIN_SCALE_X,
  LOCKER_LABEL_PAD_X,
  LOCKER_LABEL_SUPERSAMPLE,
  LOCKER_UI_SUPERSAMPLE,
} from './lockerConstants.ts';

const LOCKER_FONT = 'LockerAnton';
const LOCKER_COUNT_FONT = 'LockerTitanOne';
const LABEL_FONT_STACK = `${LOCKER_FONT}, Impact, "Arial Black", sans-serif`;
const UI_FONT_STACK = `${LOCKER_FONT}, Impact, "Arial Black", sans-serif`;
const IS_LINUX = process.platform === 'linux';
const FOOTER_FONT_WEIGHT = IS_LINUX ? 700 : 900;

import type { LockerPageScratch } from './types.ts';

let labelFontReady = false;
let countFontReady = false;

function resolveLockerAssetPath(fileName: string): string | null {
  const fromModule = path.join((import.meta.dirname ?? __dirname), 'assets', fileName);
  if (fs.existsSync(fromModule)) return fromModule;

  const glowRoot = path.resolve((import.meta.dirname ?? __dirname), '../../../../..');
  const candidates = [
    path.join(glowRoot, 'src/discord/managers/images/br/locker/assets', fileName),
    path.join(process.cwd(), 'src/discord/managers/images/br/locker/assets', fileName),
    path.join(process.cwd(), 'apps/bots/glow/src/discord/managers/images/br/locker/assets', fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function ensureLockerLabelFont(): void {
  if (labelFontReady) return;
  const fontPath = resolveLockerAssetPath('Anton-Regular.ttf');
  if (!fontPath) return;
  registerFont(fontPath, { family: LOCKER_FONT });
  labelFontReady = true;
}

function ensureLockerCountFont(): void {
  if (countFontReady) return;
  const fontPath = resolveLockerAssetPath('TitanOne-Regular.ttf');
  if (!fontPath) return;
  registerFont(fontPath, { family: LOCKER_COUNT_FONT });
  countFontReady = true;
}

function ensureLockerFont(): void {
  ensureLockerLabelFont();
}

function headerCountFontSpec(fontSize: number): string {
  return `${fontSize}px ${LOCKER_COUNT_FONT}`;
}

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setLabelFont(ctx: NodeCanvasCtx, fontSize: number): void {
  ctx.font = `900 ${fontSize}px ${LABEL_FONT_STACK}`;
}

function measureLineWidth(ctx: NodeCanvasCtx, text: string, fontSize: number): number {
  if (!text) return 0;
  setLabelFont(ctx, fontSize);
  return ctx.measureText(text).width;
}

function labelLineStep(fontSize: number, lineCount: number): number {
  if (lineCount <= 1) return fontSize * 1.02;
  if (lineCount === 2) return fontSize * 0.94;
  return fontSize * 0.86;
}

function fitsInBar(fontSize: number, lineCount: number, maxHeight?: number): boolean {
  if (!maxHeight) return true;
  return lineCount * labelLineStep(fontSize, lineCount) <= maxHeight - 1;
}

function truncateLineToWidth(
  ctx: NodeCanvasCtx,
  text: string,
  maxWidth: number,
  fontSize: number,
): string {
  if (measureLineWidth(ctx, text, fontSize) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && measureLineWidth(ctx, `${out}…`, fontSize) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out.length < text.length ? `${out}…` : out;
}

const layoutProbe = createCanvas(1, 1);
const layoutCtx = layoutProbe.getContext('2d');

export interface FittedLockerLabelLayout {
  lines: string[];
  fontSize: number;
  letterSpacing: number;
  scaleX: number;
}

function bestMultiLineSplit(
  label: string,
  ctx: NodeCanvasCtx,
  maxWidth: number,
  fontSize: number,
  letterSpacing: number,
  maxLines: number,
): string[] | null {
  const words = label.split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  for (let lineCount = 2; lineCount <= maxLines; lineCount++) {
    const split = trySplitWordsIntoLines(words, lineCount, ctx, maxWidth, fontSize, letterSpacing);
    if (split) return split;
  }
  return null;
}

function trySplitWordsIntoLines(
  words: string[],
  lineCount: number,
  ctx: NodeCanvasCtx,
  maxWidth: number,
  fontSize: number,
  letterSpacing: number,
): string[] | null {
  const n = words.length;
  if (lineCount > n) return null;

  const dp: boolean[][] = Array.from({ length: n + 1 }, () => Array(lineCount + 1).fill(false));
  const prev: Array<Array<number | null>> = Array.from({ length: n + 1 }, () => Array(lineCount + 1).fill(null));
  dp[0]![0] = true;

  for (let lines = 1; lines <= lineCount; lines++) {
    for (let i = lines; i <= n; i++) {
      for (let j = lines - 1; j < i; j++) {
        if (!dp[j]![lines - 1]) continue;
        const text = words.slice(j, i).join(' ');
        if (measureLineWidth(ctx, text, fontSize) > maxWidth) continue;
        dp[i]![lines] = true;
        prev[i]![lines] = j;
        break;
      }
    }
  }

  if (!dp[n]![lineCount]) return null;

  const out: string[] = [];
  let i = n;
  let lines = lineCount;
  while (lines > 0) {
    const j = prev[i]![lines]!;
    out.unshift(words.slice(j, i).join(' '));
    i = j;
    lines--;
  }
  return out;
}

function forceMultiLineSplit(label: string, lineCount: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  if (words.length <= lineCount) return [...words];

  const out: string[] = [];
  const perLine = Math.ceil(words.length / lineCount);
  for (let i = 0; i < words.length; i += perLine) {
    out.push(words.slice(i, i + perLine).join(' '));
  }
  return out.slice(0, lineCount);
}

function layoutFits(
  lines: string[],
  fontSize: number,
  maxWidth: number,
  maxHeight: number | undefined,
  ctx: NodeCanvasCtx,
): boolean {
  const lineCount = lines.filter(Boolean).length || 1;
  if (!fitsInBar(fontSize, lineCount, maxHeight)) return false;
  for (const line of lines) {
    if (!line) continue;
    if (measureLineWidth(ctx, line, fontSize) > maxWidth) return false;
  }
  return true;
}

/**
 * Fit label inside width + bar height. No negative tracking, no scaleX squeeze.
 */
export function fitLockerLabelLayout(
  raw: string,
  maxWidth: number,
  baseFontSize: number,
  minFontSize = LOCKER_LABEL_MIN_FONT_SIZE,
  _minScaleX = LOCKER_LABEL_MIN_SCALE_X,
  maxLines = LOCKER_LABEL_MAX_LINES,
  maxHeight?: number,
): FittedLockerLabelLayout {
  const label = String(raw).toUpperCase().trim();
  if (!label) {
    return { lines: [''], fontSize: baseFontSize, letterSpacing: 0, scaleX: 1 };
  }

  const ctx = layoutCtx;
  const letterSpacing = 0;

  for (let fontSize = baseFontSize; fontSize >= minFontSize; fontSize -= 1) {
    if (layoutFits([label], fontSize, maxWidth, maxHeight, ctx)) {
      return { lines: [label], fontSize, letterSpacing, scaleX: 1 };
    }
  }

  for (let fontSize = baseFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const split = bestMultiLineSplit(label, ctx, maxWidth, fontSize, letterSpacing, maxLines);
    if (split && layoutFits(split, fontSize, maxWidth, maxHeight, ctx)) {
      return { lines: split, fontSize, letterSpacing, scaleX: 1 };
    }
  }

  const fontSize = minFontSize;
  const wordCount = label.split(/\s+/).filter(Boolean).length;
  const split = bestMultiLineSplit(label, ctx, maxWidth, fontSize, letterSpacing, maxLines)
    ?? forceMultiLineSplit(label, Math.min(maxLines, Math.max(2, wordCount)));
  const lines = split.map((line) => truncateLineToWidth(ctx, line, maxWidth, fontSize));

  return { lines, fontSize, letterSpacing, scaleX: 1 };
}

/** @deprecated use fitLockerLabelLayout */
export function fitLockerLabelText(
  raw: string,
  maxWidth: number,
  baseFontSize: number,
  minFontSize = LOCKER_LABEL_MIN_FONT_SIZE,
  minScaleX = LOCKER_LABEL_MIN_SCALE_X,
): { text: string; fontSize: number; scaleX: number } {
  const layout = fitLockerLabelLayout(raw, maxWidth, baseFontSize, minFontSize, minScaleX);
  return {
    text: layout.lines.join(' '),
    fontSize: layout.fontSize,
    scaleX: layout.scaleX,
  };
}

function drawLabelLine(
  ctx: NodeCanvasCtx,
  text: string,
  centerX: number,
  centerY: number,
  fontSize: number,
): void {
  if (!text) return;
  setLabelFont(ctx, fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, Math.round(centerX), Math.round(centerY));
}

function drawCompressedLabel(
  ctx: NodeCanvasCtx,
  label: string,
  width: number,
  height: number,
  baseFontSize: number,
  padX: number,
): void {
  const maxW = width - padX * 2;
  const layout = fitLockerLabelLayout(label, maxW, baseFontSize, undefined, undefined, undefined, height);
  const lines = layout.lines.filter(Boolean);
  const lineCount = lines.length || 1;
  const lineStep = labelLineStep(layout.fontSize, lineCount);
  const blockH = lineCount * lineStep;
  let y = (height - blockH) / 2 + layout.fontSize * 0.48;

  ctx.fillStyle = '#ffffff';
  for (const line of layout.lines) {
    if (!line) continue;
    drawLabelLine(ctx, line, width / 2, y, layout.fontSize);
    y += lineStep;
  }
}

async function downsampleLabelPng(input: Buffer, width: number, height: number, ss?: number): Promise<Buffer> {
  const factor = ss ?? LOCKER_LABEL_SUPERSAMPLE;
  if (factor <= 1) {
    return sharp(input).png({ compressionLevel: 0 }).toBuffer();
  }
  return sharp(input)
    .resize(width, height, { kernel: sharp.kernel.cubic })
    .png({ compressionLevel: 1 })
    .toBuffer();
}

async function renderLabelCanvas(
  text: string,
  width: number,
  height: number,
  fontSize: number,
): Promise<Buffer> {
  const ss = LOCKER_LABEL_SUPERSAMPLE;
  ensureLockerFont();

  const canvas = createCanvas(width * ss, height * ss);
  const ctx = canvas.getContext('2d');
  ctx.scale(ss, ss);
  ctx.clearRect(0, 0, width, height);
  drawCompressedLabel(ctx, text, width, height, fontSize, LOCKER_LABEL_PAD_X);

  if (ss <= 1) {
    return canvas.toBuffer('image/png');
  }
  return downsampleLabelPng(canvas.toBuffer('image/png'), width, height, ss);
}

async function renderLabelSvg(
  text: string,
  width: number,
  height: number,
  fontSize: number,
): Promise<Buffer> {
  const layout = fitLockerLabelLayout(text, width - LOCKER_LABEL_PAD_X * 2, fontSize, undefined, undefined, undefined, height);
  const lines = layout.lines.filter(Boolean);
  const lineCount = lines.length || 1;
  const lineStep = labelLineStep(layout.fontSize, lineCount);
  const blockH = lineCount * lineStep;
  let y = (height - blockH) / 2 + layout.fontSize * 0.48;

  const parts = layout.lines
    .filter(Boolean)
    .map((line) => {
      const row = `<text x="50%" y="${y}" dominant-baseline="middle" text-anchor="middle"
        fill="#ffffff" font-family="${LABEL_FONT_STACK}" font-size="${layout.fontSize}" font-weight="900">${escapeXml(line)}</text>`;
      y += lineStep;
      return row;
    });

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function renderLockerLabelText(
  text: string,
  width: number,
  height: number,
  options?: { fontSize?: number; scratch?: LockerPageScratch },
): Promise<Buffer> {
  const fontSize = options?.fontSize ?? LOCKER_LABEL_FONT_SIZE;
  const cacheKey = `${width}|${height}|${fontSize}|${text}`;
  const scratch = options?.scratch;
  if (scratch) {
    const hit = scratch.labels.get(cacheKey);
    if (hit) return hit;
  }

  let buf: Buffer;
  try {
    buf = await renderLabelCanvas(text, width, height, fontSize);
  } catch {
    buf = await renderLabelSvg(text, width, height, fontSize);
  }
  scratch?.labels.set(cacheKey, buf);
  return buf;
}

export async function renderLockerHeaderDivider(barW: number, barH: number): Promise<Buffer> {
  const radius = Math.min(1, Math.round(barW / 2));
  const svg = `<svg width="${barW}" height="${barH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${barW}" height="${barH}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function drawHeaderCountText(ctx: NodeCanvasCtx, text: string, fontSize: number): void {
  ctx.font = headerCountFontSpec(fontSize);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 0, 0);
}

export async function renderLockerHeaderCountStyled(
  total: number,
  fontSize: number,
  scaleX = 1,
): Promise<Buffer> {
  const ss = LOCKER_UI_SUPERSAMPLE;
  const mainText = String(total);

  ensureLockerCountFont();
  if (!countFontReady) {
    throw new Error('Locker header count requires Titan One font (TitanOne-Regular.ttf)');
  }

  const probe = createCanvas(1, 1);
  const pctx = probe.getContext('2d');
  pctx.font = headerCountFontSpec(fontSize);
  const mainW = pctx.measureText(mainText).width * scaleX;
  const padX = Math.max(1, Math.round(fontSize * 0.04));
  const width = Math.ceil(mainW) + padX * 2;
  const height = Math.round(fontSize * 1.18);

  const canvas = createCanvas(width * ss, height * ss);
  const ctx = canvas.getContext('2d');
  ctx.scale(ss, ss);
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(padX, height / 2);
  if (scaleX < 0.999) ctx.scale(scaleX, 1);
  drawHeaderCountText(ctx, mainText, fontSize);
  ctx.restore();

  return downsampleLabelPng(canvas.toBuffer('image/png'), width, height, ss);
}

export interface LockerFooterTextSegment {
  text: string;
  color?: string;
  underline?: boolean;
}

function measureStyledFooterWidth(
  ctx: NodeCanvasCtx,
  segments: LockerFooterTextSegment[],
  letterSpacing: number,
): number {
  const chars = segments.flatMap((segment) => [...segment.text]);
  let width = 0;
  for (let i = 0; i < chars.length; i++) {
    width += ctx.measureText(chars[i]!).width;
    if (i < chars.length - 1) width += letterSpacing;
  }
  return width;
}

function drawStyledFooterSegment(
  ctx: NodeCanvasCtx,
  segment: LockerFooterTextSegment,
  x: number,
  fontSize: number,
  letterSpacing: number,
  hasMoreChars: boolean,
): number {
  const color = segment.color ?? '#ffffff';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const startX = x;
  const chars = [...segment.text];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (IS_LINUX) {
      ctx.fillText(ch, x, 0);
    } else {
      ctx.strokeText(ch, x, 0);
      ctx.fillText(ch, x, 0);
      ctx.fillText(ch, x + 0.7, 0);
    }
    x += ctx.measureText(ch).width;
    const moreInSegment = i < chars.length - 1;
    if (moreInSegment || hasMoreChars) x += letterSpacing;
  }

  if (segment.underline && chars.length) {
    const underlineY = fontSize * 0.38;
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.5, fontSize * 0.07);
    ctx.strokeStyle = color;
    ctx.moveTo(startX, underlineY);
    ctx.lineTo(x - (hasMoreChars ? letterSpacing : 0), underlineY);
    ctx.stroke();
  }

  return x;
}

export async function renderLockerFooterStyledText(
  segments: LockerFooterTextSegment[],
  fontSize: number,
  options?: { scaleX?: number; letterSpacing?: number },
): Promise<Buffer> {
  const scaleX = options?.scaleX ?? 1.08;
  const letterSpacing = options?.letterSpacing ?? fontSize * 0.06;
  const ss = LOCKER_UI_SUPERSAMPLE;

  try {
    ensureLockerFont();
    const probe = createCanvas(1, 1);
    const pctx = probe.getContext('2d');
    pctx.font = `${FOOTER_FONT_WEIGHT} ${fontSize}px ${LABEL_FONT_STACK}`;

    const rawW = measureStyledFooterWidth(pctx, segments, letterSpacing);
    const strokePad = IS_LINUX ? 1 : Math.max(2, Math.round(fontSize * 0.05));
    const width = Math.ceil(rawW * scaleX) + strokePad * 2;
    const height = Math.round(fontSize * 1.14);

    const canvas = createCanvas(width * ss, height * ss);
    const ctx = canvas.getContext('2d');
    ctx.scale(ss, ss);
    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(strokePad, height / 2);
    ctx.scale(scaleX, 1.02);
    ctx.font = `${FOOTER_FONT_WEIGHT} ${fontSize}px ${LABEL_FONT_STACK}`;
    ctx.lineWidth = IS_LINUX ? 0 : Math.max(2.5, fontSize * 0.08);

    let x = 0;
    for (let i = 0; i < segments.length; i++) {
      x = drawStyledFooterSegment(
        ctx,
        segments[i]!,
        x,
        fontSize,
        letterSpacing,
        i < segments.length - 1,
      );
    }
    ctx.restore();

    return downsampleLabelPng(canvas.toBuffer('image/png'), width, height, ss);
  } catch {
    const height = Math.round(fontSize * 1.14);
    const tspans = segments.map((segment) => {
      const color = segment.color ?? '#ffffff';
      const decoration = segment.underline ? ' text-decoration="underline"' : '';
      const strokeAttr = IS_LINUX ? '' : ` stroke="${color}"`;
      return `<tspan fill="${color}"${strokeAttr}${decoration}>${escapeXml(segment.text)}</tspan>`;
    }).join('');
    const strokeAttr = IS_LINUX
      ? ''
      : ` stroke="#ffffff" stroke-width="${Math.max(2, fontSize * 0.08)}" paint-order="stroke fill"`;
    const svg = `<svg height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text y="50%" dominant-baseline="middle" fill="#ffffff"${strokeAttr}
        font-family="${LABEL_FONT_STACK}" font-size="${fontSize}" font-weight="${FOOTER_FONT_WEIGHT}"
        letter-spacing="${letterSpacing}px"
        transform="scale(${scaleX} ${IS_LINUX ? 1 : 1.02})">${tspans}</text>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
}

export async function renderLockerFooterText(
  text: string,
  fontSize: number,
  options?: { scaleX?: number; letterSpacing?: number },
): Promise<Buffer> {
  return renderLockerFooterStyledText([{ text }], fontSize, options);
}

export async function renderLockerHeaderCount(
  text: string,
  fontSize: number,
  scaleX = 1,
): Promise<Buffer> {
  const ss = LOCKER_UI_SUPERSAMPLE;
  try {
    ensureLockerCountFont();
    if (!countFontReady) {
      throw new Error('Titan One font unavailable');
    }
    const probe = createCanvas(1, 1);
    const pctx = probe.getContext('2d');
    pctx.font = headerCountFontSpec(fontSize);
    const padX = Math.max(1, Math.round(fontSize * 0.04));
    const width = Math.ceil(pctx.measureText(text).width * scaleX) + padX * 2;
    const height = Math.round(fontSize * 1.18);

    const canvas = createCanvas(width * ss, height * ss);
    const ctx = canvas.getContext('2d');
    ctx.scale(ss, ss);
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(padX, height / 2);
    if (scaleX < 0.999) ctx.scale(scaleX, 1);
    drawHeaderCountText(ctx, text, fontSize);
    ctx.restore();

    return downsampleLabelPng(canvas.toBuffer('image/png'), width, height);
  } catch {
    throw new Error('Locker header count requires Titan One font');
  }
}

export async function renderLockerUiText(
  lines: Array<{ text: string; size: number; color: string; weight?: number }>,
  width: number,
): Promise<Buffer> {
  const ss = 2;
  try {
    ensureLockerFont();
    const lineH = lines.map((l) => Math.round(l.size * 1.35));
    const height = lineH.reduce((a, b) => a + b, 0) + 4;
    const canvas = createCanvas(width * ss, height * ss);
    const ctx = canvas.getContext('2d');
    ctx.scale(ss, ss);
    ctx.clearRect(0, 0, width, height);

    let y = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const h = lineH[i]!;
      ctx.font = `${line.weight ?? 800} ${line.size}px ${UI_FONT_STACK}`;
      ctx.fillStyle = line.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(line.text, 0, Math.round(y + h / 2));
      y += h;
    }

    return downsampleLabelPng(canvas.toBuffer('image/png'), width, height);
  } catch {
    const lineH = lines.map((l) => Math.round(l.size * 1.35));
    const height = lineH.reduce((a, b) => a + b, 0) + 4;
    let y = 0;
    const parts = lines.map((line, i) => {
      const h = lineH[i]!;
      const row = `<text x="0" y="${y + h / 2}" dominant-baseline="middle"
        fill="${line.color}" font-family="${UI_FONT_STACK}" font-size="${line.size}" font-weight="${line.weight ?? 800}">${escapeXml(line.text)}</text>`;
      y += h;
      return row;
    });
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
}
