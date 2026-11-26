/** Shared pixel layout for STW resources panel (1120px wide, AMOLED). */
const WIDTH = 1120;
const PAD = 28;
const COL_SHIELDS_W = 420;
const COL_BOOK_W = 188;
const COL_FOUNDER_X = COL_SHIELDS_W + COL_BOOK_W;
const FOUNDER_INNER_X = COL_FOUNDER_X + 20;
const CHALLENGE_GAP_X = 10;
const FOUNDER_INNER_W = WIDTH - FOUNDER_INNER_X - PAD;
const CHALLENGE_COL_W = Math.floor((FOUNDER_INNER_W - CHALLENGE_GAP_X) / 2);

export const LAYOUT = {
  width: WIDTH,
  pad: PAD,

  topH: 324,
  colShieldsW: COL_SHIELDS_W,
  colBookW: COL_BOOK_W,
  colFounderX: COL_FOUNDER_X,
  founderInnerX: FOUNDER_INNER_X,

  shieldRowH: 46,
  shieldRowStartY: 78,
  shieldIconX: 30,
  shieldIconSize: 30,
  shieldLabelX: 68,
  shieldBarX: 172,
  shieldBarW: 92,
  shieldBarH: 9,
  shieldFracX: 272,
  shieldEnduranceX: 306,
  shieldEnduranceW: 102,

  bookLabelY: 44,
  bookValueY: 128,
  founderLabelY: 44,
  challengeStartY: 72,
  challengeColW: CHALLENGE_COL_W,
  challengeRowH: 34,
  challengeGapX: CHALLENGE_GAP_X,
  challengeGapY: 8,

  resPadY: 14,
  resCols: 8,
  resCellH: 88,
  resIconSize: 52,
  resQtyH: 22,

  schemH: 300,
  schemBoxW: 240,
  schemBoxH: 32,
  schemBoxGap: 8,
  schemStartY: 52,
  schemLeftX: PAD,
  schemRightX: Math.floor(WIDTH / 2) + 12,

  footerH: 94,
} as const;

export function resourceGridMetrics(itemCount: number): { cols: number; rows: number; height: number } {
  const cols = LAYOUT.resCols;
  const rows = Math.max(1, Math.ceil(itemCount / cols));
  const height = LAYOUT.resPadY * 2 + rows * LAYOUT.resCellH;
  return { cols, rows, height };
}

export const MODERN_LAYOUT = {
  width: 1200,
  pad: 28,
  innerW: 1200 - 28 * 2, // 1144
  headerH: 88,
  topCardsH: 312,
  gapY: 16,
  resCols: 7,
  resCellH: 92,
  resCellGapX: 12,
  resCellGapY: 12,
  resPadInner: 20,
  resHeaderH: 48,
  schemH: 290,
  footerH: 80,
} as const;

export function modernResourceGridMetrics(itemCount: number): { cols: number; rows: number; height: number } {
  const cols = MODERN_LAYOUT.resCols;
  const rows = Math.max(1, Math.ceil(itemCount / cols));
  const height = MODERN_LAYOUT.resHeaderH + MODERN_LAYOUT.resPadInner * 2 + rows * MODERN_LAYOUT.resCellH + Math.max(0, rows - 1) * MODERN_LAYOUT.resCellGapY;
  return { cols, rows, height };
}

