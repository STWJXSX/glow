import fs from 'fs';

import sharp from 'sharp';

import {
  resolveStwPowerIconPath,
  resolveZoneImageBadgePath,
  resolveZoneLetterBadge,
} from './worldInfoAssetResolver.ts';
import { saveWorldInfoImage } from './worldInfoCache.ts';
import {
  WORLD_INFO_BADGE,
  WORLD_INFO_BADGE_IMG,
  WORLD_INFO_BG,
  WORLD_INFO_EMPTY_H,
  WORLD_INFO_HEADER_BG,
  WORLD_INFO_HEADER_H,
  WORLD_INFO_MAX_MODS,
  WORLD_INFO_MAX_REWARDS,
  WORLD_INFO_MISSION_ICON,
  WORLD_INFO_MOD_GAP,
  WORLD_INFO_MOD_SZ,
  WORLD_INFO_OUTPUT_WEBP,
  WORLD_INFO_PAD,
  WORLD_INFO_PAD_BOTTOM,
  WORLD_INFO_PILL_H,
  WORLD_INFO_PILL_ICON,
  WORLD_INFO_POWER_BADGE_H,
  WORLD_INFO_POWER_ICON,
  WORLD_INFO_ROW_EVEN,
  WORLD_INFO_ROW_GAP,
  WORLD_INFO_ROW_ODD,
  WORLD_INFO_ROW_PAD_BOTTOM,
  WORLD_INFO_ROW_REWARD_H,
  WORLD_INFO_ROW_TOP_H,
  WORLD_INFO_WIDTH,
} from './worldInfoConstants.ts';
import type { WorldInfoMissionRow, WorldInfoSectionInput, WorldInfoSectionImageResult } from './types.ts';

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}\u2026`;
}

function estimateTextMaxChars(widthPx: number): number {
  return Math.max(8, Math.floor(widthPx / 7));
}

function rewardPillWidth(reward: { quantity: number; rarityBorderColor: string | null }): number {
  const iconW = reward.rarityBorderColor ? WORLD_INFO_PILL_H : WORLD_INFO_PILL_ICON;
  const qtyW = reward.quantity > 1 ? String(reward.quantity).length * 6 + 8 : 0;
  return iconW + qtyW + 8;
}

function powerBadgeWidth(power: number): number {
  const digits = String(power).length;
  return 6 + WORLD_INFO_POWER_ICON + 3 + digits * 6 + 6;
}

function modifiersBlockWidth(modCount: number): number {
  if (modCount <= 0) return 0;
  return modCount * WORLD_INFO_MOD_SZ + (modCount - 1) * WORLD_INFO_MOD_GAP;
}

function missionRowHeight(row: PreparedRow): number {
  const hasRewards = row.rewards.length > 0 || row.extraRewards > 0;
  if (!hasRewards) return WORLD_INFO_ROW_TOP_H + WORLD_INFO_ROW_PAD_BOTTOM;
  return WORLD_INFO_ROW_TOP_H + WORLD_INFO_ROW_GAP + WORLD_INFO_ROW_REWARD_H + WORLD_INFO_ROW_PAD_BOTTOM;
}

function rowYOffset(index: number, rows: PreparedRow[]): number {
  let y = WORLD_INFO_HEADER_H;
  for (let i = 0; i < index; i++) y += missionRowHeight(rows[i]);
  return y;
}

function missionContentLeft(hasAlerts: boolean): number {
  return WORLD_INFO_PAD + (hasAlerts ? 4 : 0) + WORLD_INFO_BADGE + 8 + WORLD_INFO_MISSION_ICON + 10;
}

async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function loadIcon(iconPath: string | null, size: number): Promise<Buffer | null> {
  if (!iconPath || !fs.existsSync(iconPath)) return null;
  return sharp(iconPath)
    .resize(size, size, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
}

async function composeRewardIcon(
  icon: Buffer,
  borderColor: string | null,
  innerSize: number,
): Promise<Buffer> {
  if (!borderColor) return icon;

  const borderPx = 1.5;
  const padPx = 1;
  const outerSize = Math.round(innerSize + (borderPx + padPx) * 2);
  const inset = Math.round(borderPx + padPx);

  const svg = `<svg width="${outerSize}" height="${outerSize}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${borderPx / 2}" y="${borderPx / 2}" width="${outerSize - borderPx}" height="${outerSize - borderPx}" rx="5" fill="none" stroke="${borderColor}" stroke-width="${borderPx}"/>
  </svg>`;

  const frame = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(frame)
    .composite([{ input: icon, left: inset, top: inset }])
    .png()
    .toBuffer();
}

async function loadRewardIcon(
  iconPath: string | null,
  borderColor: string | null,
): Promise<Buffer | null> {
  const inner = await loadIcon(iconPath, WORLD_INFO_PILL_ICON);
  if (!inner) return null;
  return composeRewardIcon(inner, borderColor, WORLD_INFO_PILL_ICON);
}

interface PreparedRow {
  mission: WorldInfoMissionRow;
  missionIcon: Buffer | null;
  zoneBadgeIcon: Buffer | null;
  letterBadge: { letter: string; color: string } | null;
  modifiers: Array<{ icon: Buffer | null }>;
  rewards: Array<{ iconPath: string | null; icon: Buffer | null; quantity: number; rarityBorderColor: string | null }>;
  extraRewards: number;
}

async function prepareRow(mission: WorldInfoMissionRow): Promise<PreparedRow> {
  const modifiers = mission.modifiers.slice(0, WORLD_INFO_MAX_MODS);
  const grouped = mission.rewards;
  const rewards = grouped.slice(0, WORLD_INFO_MAX_REWARDS);
  const extraRewards = Math.max(0, grouped.length - rewards.length);

  const letterBadge = resolveZoneLetterBadge(mission.zoneBadgeZone);
  const zoneBadgePath = letterBadge ? null : resolveZoneImageBadgePath(mission.zoneBadgeZone);

  const [missionIcon, zoneBadgeIcon, modifierIcons, rewardIcons] = await Promise.all([
    loadIcon(mission.missionIconPath, WORLD_INFO_MISSION_ICON),
    loadIcon(zoneBadgePath, WORLD_INFO_BADGE_IMG),
    Promise.all(modifiers.map((mod) => loadIcon(mod.iconPath, WORLD_INFO_MOD_SZ))),
    Promise.all(rewards.map((reward) => loadRewardIcon(reward.iconPath, reward.rarityBorderColor))),
  ]);

  return {
    mission,
    missionIcon,
    zoneBadgeIcon,
    letterBadge,
    modifiers: modifiers.map((mod, index) => ({ icon: modifierIcons[index] ?? null })),
    rewards: rewards.map((reward, index) => ({
      iconPath: reward.iconPath,
      quantity: reward.quantity,
      rarityBorderColor: reward.rarityBorderColor,
      icon: rewardIcons[index] ?? null,
    })),
    extraRewards,
  };
}

function buildSectionSvg(
  input: WorldInfoSectionInput,
  rows: PreparedRow[],
  frameH: number,
): string {
  const W = WORLD_INFO_WIDTH;
  const color = input.color;
  const title = esc(truncateText(input.title.toUpperCase(), 42));
  const countText = String(rows.length);

  let svg = `<svg width="${W}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${W}" height="${frameH}" fill="${WORLD_INFO_BG}"/>`;
  svg += `<rect x="0.5" y="0.5" width="${W - 1}" height="${frameH - 1}" fill="none" stroke="rgba(255,255,255,0.08)"/>`;
  svg += `<rect width="${W}" height="${WORLD_INFO_HEADER_H}" fill="${WORLD_INFO_HEADER_BG}"/>`;
  svg += `<rect width="3" height="${WORLD_INFO_HEADER_H}" fill="${color}"/>`;

  const headerIconX = WORLD_INFO_PAD;
  const headerIconY = 15;
  if (!input.sectionIconPath) {
    svg += `<rect x="${headerIconX}" y="${headerIconY}" width="24" height="24" rx="5" fill="${color}"/>`;
  }

  const titleX = headerIconX + 34;
  svg += `<text x="${titleX}" y="${WORLD_INFO_HEADER_H / 2}" fill="rgba(255,255,255,0.94)" font-family="Segoe UI,Arial,sans-serif" font-size="15" font-weight="800" dominant-baseline="middle">${title}</text>`;

  const countW = Math.max(22, countText.length * 7 + 14);
  const countX = titleX + Math.min(title.length * 8.5, W - titleX - countW - 96) + 10;
  svg += `<rect x="${countX}" y="${WORLD_INFO_HEADER_H / 2 - 10}" width="${countW}" height="20" rx="5" fill="${color}22" stroke="${color}55"/>`;
  svg += `<text x="${countX + countW / 2}" y="${WORLD_INFO_HEADER_H / 2}" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="middle">${countText}</text>`;

  if (rows.length === 0) {
    svg += `<text x="${W / 2}" y="${WORLD_INFO_HEADER_H + WORLD_INFO_EMPTY_H / 2}" fill="rgba(255,255,255,0.35)" font-family="Segoe UI,Arial,sans-serif" font-size="12" text-anchor="middle" dominant-baseline="middle">No missions found</text>`;
  }

  rows.forEach((row, index) => {
    const y = rowYOffset(index, rows);
    const rowH = missionRowHeight(row);
    const rowBg = index % 2 === 0 ? WORLD_INFO_ROW_EVEN : WORLD_INFO_ROW_ODD;
    const mission = row.mission;
    const zoneLabel = mission.zoneLabel;
    const infoTop = y + 8;
    const nameY = infoTop + 10;
    const tagsY = infoTop + 28;
    const badgeCy = infoTop + WORLD_INFO_MISSION_ICON / 2 + 1;
    const iconTop = infoTop + 1;

    svg += `<rect x="0" y="${y}" width="${W}" height="${rowH}" fill="${rowBg}"/>`;
    svg += `<line x1="0" y1="${y + rowH - 0.5}" x2="${W}" y2="${y + rowH - 0.5}" stroke="rgba(255,255,255,0.06)"/>`;

    if (mission.hasAlerts) {
      svg += `<rect x="0" y="${y}" width="3" height="${rowH}" fill="#f59e0b"/>`;
    }

    let lx = WORLD_INFO_PAD + (mission.hasAlerts ? 4 : 0);
    if (row.letterBadge) {
      const badgeColor = row.letterBadge.color;
      svg += `<rect x="${lx}" y="${badgeCy - WORLD_INFO_BADGE / 2}" width="${WORLD_INFO_BADGE}" height="${WORLD_INFO_BADGE}" rx="4" fill="${badgeColor}"/>`;
      svg += `<text x="${lx + WORLD_INFO_BADGE / 2}" y="${badgeCy + 0.5}" fill="#ffffff" font-family="Segoe UI,Arial,sans-serif" font-size="11" font-weight="800" text-anchor="middle" dominant-baseline="middle">${esc(row.letterBadge.letter)}</text>`;
    } else if (!row.zoneBadgeIcon) {
      svg += `<rect x="${lx}" y="${badgeCy - WORLD_INFO_BADGE / 2}" width="${WORLD_INFO_BADGE}" height="${WORLD_INFO_BADGE}" rx="4" fill="#555555"/>`;
    }
    lx += WORLD_INFO_BADGE + 8;

    const textLeft = missionContentLeft(mission.hasAlerts);
    const modsW = modifiersBlockWidth(row.modifiers.length);
    const textMaxW = W - textLeft - WORLD_INFO_PAD - modsW - 6;
    const maxChars = estimateTextMaxChars(textMaxW);

    svg += `<text x="${textLeft}" y="${nameY}" fill="rgba(255,255,255,0.94)" font-family="Segoe UI,Arial,sans-serif" font-size="12" font-weight="500">${esc(truncateText(mission.missionName, maxChars))}</text>`;

    const pbW = powerBadgeWidth(mission.power);
    const pbX = textLeft;
    const pbY = tagsY - WORLD_INFO_POWER_BADGE_H / 2;
    svg += `<rect x="${pbX}" y="${pbY}" width="${pbW}" height="${WORLD_INFO_POWER_BADGE_H}" rx="3" fill="rgba(255,255,255,0.06)"/>`;
    svg += `<text x="${pbX + 6 + WORLD_INFO_POWER_ICON + 3}" y="${tagsY}" fill="rgba(255,255,255,0.55)" font-family="Segoe UI,Arial,sans-serif" font-size="10" font-weight="600" dominant-baseline="middle">${mission.power}</text>`;
    svg += `<text x="${pbX + pbW + 6}" y="${tagsY}" fill="rgba(255,255,255,0.38)" font-family="Segoe UI,Arial,sans-serif" font-size="10" dominant-baseline="middle">${esc(zoneLabel)}</text>`;

    if (row.rewards.length > 0 || row.extraRewards > 0) {
      const rewardY = y + WORLD_INFO_ROW_TOP_H + WORLD_INFO_ROW_GAP;
      const rewardCy = rewardY + WORLD_INFO_ROW_REWARD_H / 2;
      let rx = missionContentLeft(mission.hasAlerts);
      const extraW = row.extraRewards > 0 ? Math.max(28, String(row.extraRewards).length * 7 + 18) : 0;

      for (const reward of row.rewards) {
        const pillW = rewardPillWidth(reward);
        svg += `<rect x="${rx}" y="${rewardCy - WORLD_INFO_PILL_H / 2}" width="${pillW}" height="${WORLD_INFO_PILL_H}" rx="4" fill="rgba(255,255,255,0.06)"/>`;
        if (reward.quantity > 1) {
          const iconW = reward.rarityBorderColor ? WORLD_INFO_PILL_H : WORLD_INFO_PILL_ICON;
          svg += `<text x="${rx + iconW + 4}" y="${rewardCy}" fill="rgba(255,255,255,0.62)" font-family="Segoe UI,Arial,sans-serif" font-size="10" font-weight="700" dominant-baseline="middle">x${reward.quantity}</text>`;
        }
        rx += pillW + 4;
      }

      if (row.extraRewards > 0) {
        svg += `<rect x="${rx}" y="${rewardCy - WORLD_INFO_PILL_H / 2}" width="${extraW}" height="${WORLD_INFO_PILL_H}" rx="4" fill="rgba(255,255,255,0.06)"/>`;
        svg += `<text x="${rx + extraW / 2}" y="${rewardCy}" fill="rgba(255,255,255,0.55)" font-family="Segoe UI,Arial,sans-serif" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="middle">+${row.extraRewards}</text>`;
      }
    }
  });

  svg += '</svg>';
  return svg;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

export async function renderWorldInfoSectionImage(
  input: WorldInfoSectionInput,
  fileBaseName = 'stw-alerts',
): Promise<WorldInfoSectionImageResult> {
  const rows = await Promise.all(input.missions.map(prepareRow));
  const bodyH = rows.length > 0
    ? rows.reduce((sum, row) => sum + missionRowHeight(row), 0)
    : WORLD_INFO_EMPTY_H;
  const frameH = WORLD_INFO_HEADER_H + bodyH + WORLD_INFO_PAD_BOTTOM;

  const [baseBuf, sectionIconBuf, powerIconBuf] = await Promise.all([
    svgToPng(buildSectionSvg(input, rows, frameH)),
    loadIcon(input.sectionIconPath ?? null, 24),
    loadIcon(resolveStwPowerIconPath(), WORLD_INFO_POWER_ICON),
  ]);

  const overlays: sharp.OverlayOptions[] = [];

  if (sectionIconBuf) {
    overlays.push({ input: sectionIconBuf, left: WORLD_INFO_PAD, top: 15 });
  }

  rows.forEach((row, index) => {
    const y = rowYOffset(index, rows);
    const infoTop = y + 8;
    const badgeCy = infoTop + WORLD_INFO_MISSION_ICON / 2 + 1;
    const iconTop = infoTop + 1;
    const tagsY = infoTop + 28;
    let lx = WORLD_INFO_PAD + (row.mission.hasAlerts ? 4 : 0);

    if (row.zoneBadgeIcon) {
      overlays.push({
        input: row.zoneBadgeIcon,
        left: lx,
        top: Math.round(badgeCy - WORLD_INFO_BADGE_IMG / 2),
      });
    }
    lx += WORLD_INFO_BADGE + 8;

    if (row.missionIcon) {
      overlays.push({
        input: row.missionIcon,
        left: lx,
        top: iconTop,
      });
    }

    const textLeft = missionContentLeft(row.mission.hasAlerts);
    if (powerIconBuf) {
      overlays.push({
        input: powerIconBuf,
        left: textLeft + 6,
        top: Math.round(tagsY - WORLD_INFO_POWER_ICON / 2),
      });
    }

    if (row.modifiers.length > 0) {
      let mx = WORLD_INFO_WIDTH - WORLD_INFO_PAD;
      const modTop = infoTop + 2;
      for (let i = row.modifiers.length - 1; i >= 0; i--) {
        const mod = row.modifiers[i];
        mx -= WORLD_INFO_MOD_SZ;
        if (mod.icon) {
          overlays.push({
            input: mod.icon,
            left: mx,
            top: modTop,
          });
        }
        if (i > 0) mx -= WORLD_INFO_MOD_GAP;
      }
    }

    if (row.rewards.length > 0 || row.extraRewards > 0) {
      const rewardY = y + WORLD_INFO_ROW_TOP_H + WORLD_INFO_ROW_GAP;
      const rewardCy = rewardY + WORLD_INFO_ROW_REWARD_H / 2;
      let rx = missionContentLeft(row.mission.hasAlerts);

      for (const reward of row.rewards) {
        const pillW = rewardPillWidth(reward);
        if (reward.icon) {
          const iconH = reward.rarityBorderColor ? WORLD_INFO_PILL_H : WORLD_INFO_PILL_ICON;
          overlays.push({
            input: reward.icon,
            left: rx + 4,
            top: Math.round(rewardCy - iconH / 2),
          });
        }
        rx += pillW + 4;
      }
    }
  });

  const buffer = await sharp(baseBuf)
    .composite(overlays)
    .webp(WORLD_INFO_OUTPUT_WEBP)
    .toBuffer();

  const fileName = `${fileBaseName}-${slugify(input.title)}.webp`;
  const filePath = saveWorldInfoImage(fileName, buffer);

  return {
    buffer,
    fileName,
    filePath,
    missionCount: rows.length,
  };
}
