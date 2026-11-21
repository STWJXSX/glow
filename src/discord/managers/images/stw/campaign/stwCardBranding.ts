import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  getMainAccountAuthor,
  DEFAULT_FORTNITE_AVATAR_URL,
} from '#helpers/epic/account/avatarHandler.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import {
  formatStwImageDate,
  formatStwMetaDateTime,
  resolveStwSiteLabel,
  type StwImageBrandingOptions,
} from '../stwImageBranding.ts';
import type { StwCardBrandingContext } from './types.ts';

export const GLOW_DISCORD_SERVER_ID = '810129117260283915';

const roundedCache = new Map<string, Buffer>();

import { resolveGlowBrandIconPath } from '#helpers/core/glowAssetPaths.ts';

export function resolveBrandIconPath(): string | null {
  return resolveGlowBrandIconPath();
}

export function formatBrandingDate(date = new Date()): string {
  return formatStwImageDate(date);
}

/** @deprecated Use resolveStwSiteLabel */
export function resolveDiscordInvite(inviteCode?: string | null): string {
  return resolveStwSiteLabel(inviteCode);
}

export function buildBrandingContext(
  displayName: string,
  accountId: string,
  options?: StwImageBrandingOptions,
): StwCardBrandingContext {
  return {
    displayName,
    accountId,
    lang: options?.lang,
    footerIconUrl: options?.footerIconUrl,
  };
}

async function loadRoundedImageFromBuffer(input: Buffer, size: number, cacheKey?: string): Promise<Buffer> {
  if (cacheKey && roundedCache.has(cacheKey)) return roundedCache.get(cacheKey)!;

  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
  );
  const buf = await sharp(input)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  if (cacheKey) roundedCache.set(cacheKey, buf);
  return buf;
}

async function loadRoundedImageFromFile(filePath: string, size: number, cacheKey?: string): Promise<Buffer> {
  if (cacheKey && roundedCache.has(cacheKey)) return roundedCache.get(cacheKey)!;
  if (!fs.existsSync(filePath)) throw new Error(`image not found: ${filePath}`);
  return loadRoundedImageFromBuffer(fs.readFileSync(filePath), size, cacheKey);
}

export function extractEquippedCharacterTemplateId(profileBody: unknown): string | null {
  if (!profileBody || typeof profileBody !== 'object') return null;
  const profile = (profileBody as any)?.profileChanges?.[0]?.profile;
  if (!profile) return null;

  const items = profile.items || {};
  const stats = profile.stats?.attributes || {};

  // 1. Direct favorite_character attribute
  const favChar = stats.favorite_character;
  if (typeof favChar === 'string' && favChar.trim()) {
    const trimmed = favChar.trim();
    if (items[trimmed]?.templateId) {
      return String(items[trimmed].templateId);
    }
    if (trimmed.startsWith('AthenaCharacter:') || trimmed.toLowerCase().startsWith('cid_')) {
      return trimmed.startsWith('AthenaCharacter:') ? trimmed : `AthenaCharacter:${trimmed}`;
    }
  }

  // 2. Active CosmeticLocker slots
  for (const item of Object.values(items) as any[]) {
    const tid = String(item?.templateId || '');
    if (tid.startsWith('CosmeticLocker:')) {
      const charSlots = item?.attributes?.locker_slots_data?.slots?.Character?.items;
      if (Array.isArray(charSlots) && charSlots.length > 0 && charSlots[0]) {
        const slotChar = String(charSlots[0]);
        if (items[slotChar]?.templateId) {
          return String(items[slotChar].templateId);
        }
        if (slotChar.startsWith('AthenaCharacter:') || slotChar.toLowerCase().startsWith('cid_')) {
          return slotChar.startsWith('AthenaCharacter:') ? slotChar : `AthenaCharacter:${slotChar}`;
        }
      }
    }
  }

  // 3. Favorite outfit or first outfit in profile
  let firstOutfit: string | null = null;
  for (const item of Object.values(items) as any[]) {
    const tid = String(item?.templateId || '');
    if (tid.startsWith('AthenaCharacter:')) {
      if (item?.attributes?.favorite) {
        return tid;
      }
      if (!firstOutfit) {
        firstOutfit = tid;
      }
    }
  }

  return firstOutfit;
}

export function resolveLocalCosmeticFile(idOrTemplateId: string): string | null {
  const slug = (idOrTemplateId.includes(':') ? idOrTemplateId.split(':')[1] : idOrTemplateId).toLowerCase();
  if (!slug) return null;

  const basePath = path.resolve(process.cwd(), 'src/discord/managers/images/br/locker/assets/cosmetics/images/br', slug);
  const candidates = [
    path.join(basePath, 'smallIcon.webp'),
    path.join(basePath, 'icon.webp'),
    path.join(basePath, 'featured.webp'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function fetchCdnCosmeticBuffer(idOrTemplateId: string): Promise<Buffer | null> {
  const id = idOrTemplateId.includes(':') ? idOrTemplateId.split(':')[1] : idOrTemplateId;
  const urls = [
    `https://fortnite-api.com/images/cosmetics/br/${id}/smallicon.png`,
    `https://fortnite-api.com/images/cosmetics/br/${id}/icon.png`,
    `https://fortnite-api.com/images/cosmetics/br/${id.toLowerCase()}/smallicon.png`,
    `https://fortnite-api.com/images/cosmetics/br/${id.toLowerCase()}/icon.png`,
  ];
  for (const url of urls) {
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 4_000,
        validateStatus: (status) => status < 400,
      });
      if (res.data) return Buffer.from(res.data);
    } catch {
      // try next
    }
  }
  return null;
}

/** Multi-tier Epic account avatar resolver. */
export async function prepareAccountAvatar(
  accessToken: string,
  accountId: string,
  size = 64,
  discordUserId?: string,
  athenaProfileBody?: unknown,
): Promise<Buffer | null> {
  const cacheKey = `account:${accountId || discordUserId || 'default'}:${size}`;
  if (roundedCache.has(cacheKey)) return roundedCache.get(cacheKey)!;

  let rawBuffer: Buffer | null = null;

  // Tier 1: Epic Games Avatar Service (avatarId configured in Epic Launcher)
  if (accessToken && accountId) {
    try {
      const response = await axios.get(
        `${Endpoints.ACCOUNT_AVATAR}/fortnite/ids?accountIds=${accountId}`,
        {
          headers: { Authorization: `bearer ${accessToken}` },
          timeout: 4_000,
          validateStatus: (s) => s < 400,
        },
      );
      const avatarId = Array.isArray(response.data) && response.data[0]?.avatarId
        ? String(response.data[0].avatarId)
        : null;

      if (avatarId) {
        const localPath = resolveLocalCosmeticFile(avatarId);
        if (localPath) {
          rawBuffer = fs.readFileSync(localPath);
        } else {
          rawBuffer = await fetchCdnCosmeticBuffer(avatarId);
        }
      }
    } catch {
      // ignore, fall through to next tier
    }
  }

  // Tier 2: Equipped outfit from Athena MCP Profile
  if (!rawBuffer && athenaProfileBody) {
    const charTemplateId = extractEquippedCharacterTemplateId(athenaProfileBody);
    if (charTemplateId) {
      const localPath = resolveLocalCosmeticFile(charTemplateId);
      if (localPath) {
        rawBuffer = fs.readFileSync(localPath);
      } else {
        rawBuffer = await fetchCdnCosmeticBuffer(charTemplateId);
      }
    }
  }

  // Tier 3: getMainAccountAuthor iconURL (Discord or Epic lookup)
  if (!rawBuffer) {
    try {
      const author = await getMainAccountAuthor(discordUserId ?? '', {
        accountId: accountId || '',
        accessToken: accessToken || '',
        displayName: 'Account',
      });
      if (author?.iconURL) {
        const match = author.iconURL.match(/\/cosmetics\/br\/([^/]+)\//);
        if (match?.[1]) {
          const localPath = resolveLocalCosmeticFile(match[1]);
          if (localPath) {
            rawBuffer = fs.readFileSync(localPath);
          }
        }
        if (!rawBuffer) {
          const res = await axios.get<ArrayBuffer>(author.iconURL, {
            responseType: 'arraybuffer',
            timeout: 6_000,
            validateStatus: (s) => s < 400,
          });
          if (res.data) rawBuffer = Buffer.from(res.data);
        }
      }
    } catch {
      // ignore
    }
  }

  // Tier 4: Local fallback default avatar (cid_890)
  if (!rawBuffer) {
    const defaultLocal = resolveLocalCosmeticFile('cid_890_athena_commando_f_choneheadhunter');
    if (defaultLocal && fs.existsSync(defaultLocal)) {
      rawBuffer = fs.readFileSync(defaultLocal);
    }
  }

  // Tier 5: Network fallback default avatar
  if (!rawBuffer) {
    try {
      const res = await axios.get<ArrayBuffer>(DEFAULT_FORTNITE_AVATAR_URL, {
        responseType: 'arraybuffer',
        timeout: 6_000,
        validateStatus: (s) => s < 400,
      });
      if (res.data) rawBuffer = Buffer.from(res.data);
    } catch {
      // ignore
    }
  }

  if (!rawBuffer) return null;

  return loadRoundedImageFromBuffer(rawBuffer, size, cacheKey);
}

export async function prepareBrandIcon(size = 40, footerIconUrl?: string | null): Promise<Buffer | null> {
  const customUrl = footerIconUrl?.trim();
  if (customUrl) {
    const cacheKey = `footer-url:${customUrl}:${size}`;
    if (roundedCache.has(cacheKey)) return roundedCache.get(cacheKey)!;
    try {
      const res = await axios.get<ArrayBuffer>(customUrl, {
        responseType: 'arraybuffer',
        timeout: 10_000,
        validateStatus: (status) => status < 400,
      });
      return loadRoundedImageFromBuffer(Buffer.from(res.data), size, cacheKey);
    } catch {
      // fall through to default icon
    }
  }

  const iconPath = resolveBrandIconPath();
  if (!iconPath || !fs.existsSync(iconPath)) return null;
  return loadRoundedImageFromFile(iconPath, size, 'brand-icon');
}

export const TYPE_META_LABELS: Record<string, string> = {
  heroes: 'Heroes',
  survivors: 'Survivors',
  schematics: 'Schematics',
  defenders: 'Defenders',
};

export function buildMetaLine(type: string, itemCount: number): string {
  const label = TYPE_META_LABELS[type] ?? 'Collection';
  return `${label} · ${itemCount} items · ${formatStwMetaDateTime()}`;
}
