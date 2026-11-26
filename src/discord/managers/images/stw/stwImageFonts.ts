import { createCanvas } from 'canvas';

/** Font stack for node-canvas (CSS syntax with quoted family names). */
export const STW_CANVAS_FONT =
  '"Segoe UI", "Noto Sans", "DejaVu Sans", "Liberation Sans", Arial, sans-serif';

/** Escaped value for SVG font-family="..." attributes. */
export const STW_SVG_FONT =
  '&quot;Segoe UI&quot;, &quot;Noto Sans&quot;, &quot;DejaVu Sans&quot;, &quot;Liberation Sans&quot;, Arial, sans-serif';

const IS_LINUX = process.platform === 'linux';

/** Linux SVG fallbacks render much heavier at 800+. */
export function stwSvgNumericWeight(): number {
  return IS_LINUX ? 600 : 800;
}

export function measureStwUiTextWidth(text: string, fontSize: number, weight: number): number {
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext('2d');
  ctx.font = `${weight} ${fontSize}px ${STW_CANVAS_FONT}`;
  return ctx.measureText(text).width;
}

export function fitStwFontSize(
  text: string,
  maxWidth: number,
  baseFontSize: number,
  minFontSize: number,
  weight: number,
): number {
  let size = baseFontSize;
  while (size > minFontSize && measureStwUiTextWidth(text, size, weight) > maxWidth) {
    size -= 1;
  }
  return size;
}
