/**
 * Shared primitives for the sharp/SVG STW image renderers (shop + loadouts).
 * Text is measured with node-canvas (same font files/shaping as the SVG renderer) and
 * painted as SVG so sharp/librsvg rasterizes it. Filters mirror the CSS `filter` /
 * `opacity` values the old Chromium renderer applied.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createCanvas, registerFont } from 'canvas';

export const RENDER_SCALE = 2;

export const UI_FONT_FAMILY = 'Segoe UI, Noto Sans, DejaVu Sans, Liberation Sans, Arial, sans-serif';
export const IMPACT_FONT_FAMILY =
  'Impact, Arial Black, Segoe UI Symbol, Anton, Noto Sans, sans-serif';
const UI_CANVAS_FONT = '"Segoe UI", "Noto Sans", "DejaVu Sans", "Liberation Sans", Arial, sans-serif';
const IMPACT_CANVAS_FONT = 'Impact, "Arial Black", Anton, "Noto Sans", sans-serif';

let fontsReady = false;

function tryRegister(filePath: string, family: string): void {
  try {
    if (filePath && fs.existsSync(filePath)) registerFont(filePath, { family });
  } catch {
    // Optional: measurement falls back to the next family in the stack.
  }
}

/** Register bundled/System fonts for measuring (librsvg resolves the same families itself). */
export function ensureRenderFonts(): void {
  if (fontsReady) return;
  fontsReady = true;
  if (process.platform === 'win32') {
    tryRegister('C:\\Windows\\Fonts\\impact.ttf', 'Impact');
    tryRegister('C:\\Windows\\Fonts\\ariblk.ttf', 'Arial Black');
  }
  const anton = path.join(import.meta.dirname, '../br/locker/assets/Anton-Regular.ttf');
  tryRegister(anton, 'Anton');
}

const measureCanvas = createCanvas(1, 1);
const measureCtx = measureCanvas.getContext('2d');

export interface UiMetrics {
  ascent: number;
  descent: number;
}

/** Chromium/DirectWrite font box per fixed size (CSS `line-height: normal` uses these). */
const UI_METRICS: Record<number, UiMetrics> = {
  10: { ascent: 11, descent: 3 },
  12: { ascent: 13, descent: 3 },
  13: { ascent: 14, descent: 3 },
  14: { ascent: 15, descent: 4 },
  15: { ascent: 16, descent: 4 },
  17: { ascent: 18, descent: 4 },
  24: { ascent: 26, descent: 6 },
  38: { ascent: 41, descent: 10 },
};

/** Impact: ascent equals the point size, descent follows DirectWrite's integer metrics. */
const IMPACT_DESCENT: Record<number, number> = {
  13: 3,
  14: 3,
  15: 3,
  17: 4,
  18: 4,
  26: 5,
  27: 6,
};

export function uiMetrics(fontSize: number): UiMetrics {
  const known = UI_METRICS[fontSize];
  if (known) return known;
  return { ascent: Math.round(fontSize * 1.075), descent: Math.round(fontSize * 0.29) };
}

export function impactMetrics(fontSize: number): UiMetrics {
  return { ascent: fontSize, descent: IMPACT_DESCENT[fontSize] ?? Math.round(fontSize * 0.2) };
}

/** CSS weight 800 resolves to Segoe UI Black on Windows, so measure/paint it as 900. */
function uiPaintWeight(weight: number): number {
  if (weight >= 800) return 900;
  return weight || 400;
}

export function measureUiText(text: string, fontSize: number, weight = 400, letterSpacing = 0): number {
  ensureRenderFonts();
  measureCtx.font = `${uiPaintWeight(weight)} ${fontSize}px ${UI_CANVAS_FONT}`;
  return measureCtx.measureText(text).width + letterSpacing * [...text].length;
}

export function measureImpactText(
  text: string,
  fontSize: number,
  options: { italic?: boolean; letterSpacing?: number } = {},
): number {
  ensureRenderFonts();
  measureCtx.font = `${options.italic ? 'italic ' : ''}${fontSize}px ${IMPACT_CANVAS_FONT}`;
  return measureCtx.measureText(text).width + (options.letterSpacing ?? 0) * [...text].length;
}

/** Baseline y for a text line box whose top is `top` (CSS half-leading). */
export function baselineFor(
  top: number,
  lineHeight: number,
  metrics: UiMetrics,
): number {
  return top + (lineHeight - (metrics.ascent + metrics.descent)) / 2 + metrics.ascent;
}

export function escapeXml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface SvgTextOptions {
  text: string;
  x: number;
  y: number;
  font: 'ui' | 'impact';
  fontSize: number;
  fill: string;
  weight?: number;
  italic?: boolean;
  anchor?: 'start' | 'middle' | 'end';
  letterSpacing?: number;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  extra?: string;
}

export function svgText(options: SvgTextOptions): string {
  const {
    text, x, y, font, fontSize, fill, weight = 400, italic, anchor = 'start',
    letterSpacing = 0, opacity, stroke, strokeWidth, extra = '',
  } = options;
  const family = font === 'impact' ? IMPACT_FONT_FAMILY : UI_FONT_FAMILY;
  const paintWeight = font === 'impact' ? 400 : uiPaintWeight(weight);
  const attrs = [
    `x="${round(italic ? 0 : x)}"`,
    `y="${round(italic ? 0 : y)}"`,
    `font-family="${family}"`,
    `font-size="${round(fontSize)}"`,
    `font-weight="${paintWeight}"`,
    `fill="${fill}"`,
    anchor !== 'start' ? `text-anchor="${anchor}"` : '',
    letterSpacing ? `letter-spacing="${round(letterSpacing)}"` : '',
    opacity !== undefined ? `opacity="${round(opacity)}"` : '',
    stroke ? `stroke="${stroke}"` : '',
    strokeWidth ? `stroke-width="${round(strokeWidth)}"` : '',
    extra,
  ].filter(Boolean);
  const textEl = `<text ${attrs.join(' ')}>${escapeXml(text)}</text>`;
  // librsvg does not synthesize oblique faces; skew the Impact fallback like Chromium does.
  if (italic) return `<g transform="translate(${round(x)},${round(y)}) skewX(-14)">${textEl}</g>`;
  return textEl;
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function truncateWithEllipsis(text: string, maxWidth: number, measure: (value: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  let out = text;
  while (out.length > 0 && measure(`${out}…`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}…`;
}

/** Greedy word wrap tuned to Chromium's line breaking for short label text. */
export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (value: string) => number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = '';
  let index = 0;
  for (; index < words.length; index++) {
    const word = words[index]!;
    const candidate = line ? `${line} ${word}` : word;
    if (!line || measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) {
      index++;
      let rest = line;
      while (index < words.length) rest += ` ${words[index++]}`;
      lines.push(truncateWithEllipsis(rest, maxWidth, measure));
      return lines;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

export function mixHex(hex: string, withHex: string, ratio: number): { r: number; g: number; b: number } {
  const a = parseHex(hex);
  const b = parseHex(withHex);
  return {
    r: Math.round(a.r * ratio + b.r * (1 - ratio)),
    g: Math.round(a.g * ratio + b.g * (1 - ratio)),
    b: Math.round(a.b * ratio + b.b * (1 - ratio)),
  };
}

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

/** Decode base64/percent-encoded data URLs (icons, portraits and SVG placeholders). */
export function dataUrlToBuffer(src: string): Buffer | null {
  const match = /^data:([^,]*),(.*)$/s.exec(src);
  if (!match) return null;
  const isBase64 = /;base64/i.test(match[1] ?? '');
  const payload = match[2] ?? '';
  try {
    if (isBase64) return Buffer.from(payload, 'base64');
    return Buffer.from(decodeURIComponent(payload), 'utf8');
  } catch {
    return null;
  }
}

export interface CssFilterOptions {
  grayscale?: number;
  brightness?: number;
  saturate?: number;
  contrast?: number;
  opacity?: number;
}

/** Apply CSS filter functions (sRGB, same order as the CSS list) to a straight-alpha RGBA buffer. */
export async function applyCssFilters(input: Buffer, options: CssFilterOptions): Promise<Buffer> {
  const { grayscale = 0, brightness = 1, saturate = 1, contrast = 1, opacity = 1 } = options;
  const needsPixels = grayscale !== 0 || brightness !== 1 || saturate !== 1 || contrast !== 1 || opacity !== 1;
  if (!needsPixels) return input;

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  const g = 1 - grayscale;
  const gray = [
    0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g,
    0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g,
    0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g,
  ];
  const s = saturate;
  const sat = [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
  for (let i = 0; i < out.length; i += 4) {
    let r = out[i]!;
    let gr = out[i + 1]!;
    let b = out[i + 2]!;
    if (grayscale !== 0) {
      const nr = gray[0]! * r + gray[1]! * gr + gray[2]! * b;
      const ng = gray[3]! * r + gray[4]! * gr + gray[5]! * b;
      const nb = gray[6]! * r + gray[7]! * gr + gray[8]! * b;
      r = nr; gr = ng; b = nb;
    }
    if (brightness !== 1) {
      r *= brightness; gr *= brightness; b *= brightness;
    }
    if (saturate !== 1) {
      const nr = sat[0]! * r + sat[1]! * gr + sat[2]! * b;
      const ng = sat[3]! * r + sat[4]! * gr + sat[5]! * b;
      const nb = sat[6]! * r + sat[7]! * gr + sat[8]! * b;
      r = nr; gr = ng; b = nb;
    }
    if (contrast !== 1) {
      const offset = 128 * (1 - contrast);
      r = r * contrast + offset;
      gr = gr * contrast + offset;
      b = b * contrast + offset;
    }
    out[i] = Math.max(0, Math.min(255, Math.round(r)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round(gr)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    if (opacity !== 1) out[i + 3] = Math.round(out[i + 3]! * opacity);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** Drop shadow for a rendered RGBA image (CSS `filter: drop-shadow(...)`). */
export async function dropShadowLayer(
  input: Buffer,
  options: { offsetX: number; offsetY: number; sigma: number; opacity: number },
): Promise<{ buffer: Buffer; left: number; top: number; width: number; height: number }> {
  const { offsetX, offsetY, sigma, opacity } = options;
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = Math.round(data[i * 4 + 3]! * opacity);
  const blurred = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
    .blur(Math.max(0.3, sigma))
    .toColourspace('b-w')
    .raw()
    .toBuffer();
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < blurred.length; i++) {
    out[i * 4] = 0;
    out[i * 4 + 1] = 0;
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = blurred[i]!;
  }
  const shadow = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
  return { buffer: shadow, left: offsetX, top: offsetY, width: info.width, height: info.height };
}

/**
 * Chromium downsamples CSS images with a mipmap chain (halve, then bilinear). libvips also
 * ignores the resize kernel for WebP shrink-on-load, so normalise to PNG and halve first.
 */
async function mipmapSource(input: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const png = await sharp(input).png().toBuffer();
  const meta = await sharp(png).metadata();
  return { buffer: png, width: meta.width ?? 1, height: meta.height ?? 1 };
}

async function mipmapResize(
  input: Buffer,
  targetW: number,
  targetH: number,
  mode: 'fill' | 'cover',
): Promise<Buffer> {
  let { buffer, width, height } = await mipmapSource(input);
  while (width >= targetW * 2 && height >= targetH * 2) {
    width = Math.max(Math.floor(width / 2), 1);
    height = Math.max(Math.floor(height / 2), 1);
    buffer = await sharp(buffer).resize(width, height, { fit: 'fill', kernel: 'linear' }).png().toBuffer();
  }
  return sharp(buffer)
    .resize(targetW, targetH, { fit: mode, position: 'top', kernel: 'linear' })
    .png()
    .toBuffer();
}

export async function containBuffer(
  input: Buffer,
  boxW: number,
  boxH: number,
): Promise<{ buffer: Buffer; width: number; height: number; offsetX: number; offsetY: number }> {
  const meta = await sharp(input).metadata();
  const srcW = meta.width ?? boxW;
  const srcH = meta.height ?? boxH;
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const buffer = await mipmapResize(input, width, height, 'fill');
  return {
    buffer,
    width,
    height,
    offsetX: Math.round((boxW - width) / 2),
    offsetY: Math.round((boxH - height) / 2),
  };
}

export async function coverTopBuffer(
  input: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return mipmapResize(input, width, height, 'cover');
}

export async function maskRounded(buffer: Buffer, radius: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(buffer).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}
