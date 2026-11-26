import path from 'node:path';
import { createCanvas, registerFont, type CanvasRenderingContext2D as NodeCanvasCtx } from 'canvas';

export const BOARD_FONT = 'Bahnschrift, "Segoe UI", Arial, sans-serif';
const HEADLINE_FONT = 'LockerAnton';

export interface HeadlineStyle {
  font: (size: number) => string;
  scaleX: number;
}

/** Headline font, and the horizontal squeeze applied when Anton could not be loaded. */
let headlineStyle: HeadlineStyle | null = null;

export function getHeadlineStyle(): HeadlineStyle {
  if (headlineStyle) return headlineStyle;
  try {
    // Same family name the locker footer registers, so both can share it
    registerFont(path.resolve(import.meta.dirname, '../br/locker/assets/Anton-Regular.ttf'), { family: HEADLINE_FONT });
  } catch {
    // handled below: the width probe fails too
  }
  // Pango silently substitutes a wide sans when a registered font cannot be used (seen on Windows).
  // Anton is far narrower than any fallback, so its width tells whether it really loaded.
  const probe = createCanvas(10, 10).getContext('2d');
  probe.font = `40px ${HEADLINE_FONT}`;
  const anton = probe.measureText('STATUS').width;
  probe.font = '40px sans-serif';
  const sans = probe.measureText('STATUS').width;
  headlineStyle = anton < sans * 0.85
    ? { font: (size) => `${size}px ${HEADLINE_FONT}`, scaleX: 1 }
    : { font: (size) => `700 ${size}px ${BOARD_FONT}`, scaleX: 0.78 };
  return headlineStyle;
}

/** Draws text in the headline font at the largest size (down to minSize) that fits maxW. */
export function drawHeadline(
  ctx: NodeCanvasCtx,
  text: string,
  x: number,
  baseline: number,
  maxW: number,
  maxSize: number,
  minSize: number,
  color: string,
): void {
  const hl = getHeadlineStyle();
  let size = maxSize;
  ctx.font = hl.font(size);
  while (size > minSize && ctx.measureText(text).width * hl.scaleX > maxW) {
    size -= 2;
    ctx.font = hl.font(size);
  }
  ctx.save();
  ctx.translate(x, baseline);
  ctx.scale(hl.scaleX, 1);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Word-wraps to at most maxLines, ending the last line with an ellipsis when text is cut. */
export function wrap(ctx: NodeCanvasCtx, text: string, maxW: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i]!;
    if (cur && ctx.measureText(next).width > maxW) {
      lines.push(cur);
      cur = words[i]!;
      if (lines.length === maxLines) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (i < words.length) {
    let last = lines[maxLines - 1]!;
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

export function clipToWidth(ctx: NodeCanvasCtx, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
