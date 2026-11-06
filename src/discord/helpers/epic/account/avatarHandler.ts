/**
 * AVATAR HANDLER
 * Obtiene el avatar y nombre de la cuenta principal de un usuario
 */

import axios from 'axios';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import UserPrivacy from '#models/UserPrivacy.ts';
import { log } from '#helpers/core/logger.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';

export interface AuthorData {
  name: string;
  iconURL: string;
}

export interface AccountData {
  accountId: string;
  accessToken?: string;
  displayName: string;
}

export const DEFAULT_FORTNITE_AVATAR_URL =
  'https://fortnite-api.com/images/cosmetics/br/cid_890_athena_commando_f_choneheadhunter/variants/material/mat2.png';

/** Fallback thumbnail when the account has no Fortnite outfit avatar (same as /lookup). */
export const EPIC_GAMES_LOGO_URL =
  'https://media.discordapp.net/attachments/1081977536684236880/1124346271742824599/Epic_Games_logo.png?width=412&height=478&ex=68332990&is=6831d810&hm=f6e0be48989f5fbddd8acc2ba851c15ae6277a8a7d23b42275177dca8db26004&';

const PRIVACY_CACHE_TTL_MS = 5 * 60 * 1000;
const privacyCache = new Map<string, { maskName: boolean; expiresAt: number }>();

/** Clear cached privacy for a user (call after privacy toggle). */
export function invalidatePrivacyCache(discordUserId: string): void {
  privacyCache.delete(discordUserId);
}

async function shouldMaskDisplayName(discordUserId: string): Promise<boolean> {
  const now = Date.now();
  const cached = privacyCache.get(discordUserId);
  if (cached && cached.expiresAt > now) return cached.maskName;

  try {
    const privacy = await UserPrivacy.findOne({ discordId: discordUserId });
    const maskName = privacy?.maskName ?? false;
    privacyCache.set(discordUserId, { maskName, expiresAt: now + PRIVACY_CACHE_TTL_MS });
    return maskName;
  } catch {
    return false;
  }
}

/**
 * Masks a display name: first + last char visible, rest replaced with *.
 * "stwjxsx" → "s*****x"   "AB" → "A*"   "A" → "*"
 */
export function maskDisplayName(name: string): string {
  if (name.length <= 1) return '*'.repeat(name.length);
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

function avatarIdToIconUrl(avatarId: string | null): string {
  if (avatarId) {
    const idPart = avatarId.includes(':') ? avatarId.split(':')[1] : avatarId;
    return `https://fortnite-api.com/images/cosmetics/br/${idPart}/smallicon.png`;
  }
  return DEFAULT_FORTNITE_AVATAR_URL;
}

/** Fortnite outfit icon, or Epic Games logo when none is set (lookup-style). */
export async function getAccountThumbnailUrl(
  accountId: string,
  accessToken: string,
): Promise<string> {
  try {
    const response = await axios.get(
      `${Endpoints.ACCOUNT_AVATAR}/fortnite/ids?accountIds=${accountId}`,
      {
        headers: { Authorization: `bearer ${accessToken}` },
        timeout: 5000,
      },
    );
    const avatarId = Array.isArray(response.data) && response.data[0]?.avatarId
      ? String(response.data[0].avatarId)
      : null;
    if (avatarId) {
      const idPart = avatarId.includes(':') ? avatarId.split(':')[1] : avatarId;
      return `https://fortnite-api.com/images/cosmetics/br/${idPart}/smallicon.png`;
    }
  } catch (err: any) {
    if (err.code !== 'ECONNABORTED' && err.response?.status !== 401) {
      log.epic.debug({ accountId, error: err.message }, 'Error obteniendo avatar de Epic');
    }
  }
  return EPIC_GAMES_LOGO_URL;
}

/** Fortnite outfit icon for any Epic account (works for friends and non-friends). */
export async function getFortniteAccountAvatarUrl(
  accountId: string,
  accessToken: string,
): Promise<string> {
  try {
    const response = await axios.get(
      `${Endpoints.ACCOUNT_AVATAR}/fortnite/ids?accountIds=${accountId}`,
      {
        headers: { Authorization: `bearer ${accessToken}` },
        timeout: 5000,
      },
    );
    const avatarId = Array.isArray(response.data) && response.data[0]?.avatarId
      ? String(response.data[0].avatarId)
      : null;
    return avatarIdToIconUrl(avatarId);
  } catch (err: any) {
    if (err.code !== 'ECONNABORTED' && err.response?.status !== 401) {
      log.epic.debug({ accountId, error: err.message }, 'Error obteniendo avatar de Epic');
    }
    return DEFAULT_FORTNITE_AVATAR_URL;
  }
}

const AVATAR_FRESH_TTL_MS = 30 * 60 * 1000;
const AVATAR_RETRY_DELAY_MS = 400;
const avatarIdCache = new Map<string, { avatarId: string | null; fetchedAt: number }>();

async function fetchAvatarId(accountId: string, accessToken: string | undefined): Promise<string | null> {
  const response = await axios.get(
    `${Endpoints.ACCOUNT_AVATAR}/fortnite/ids?accountIds=${accountId}`,
    { headers: { Authorization: `bearer ${accessToken}` }, timeout: 2500 },
  );
  return Array.isArray(response.data) && response.data[0]?.avatarId
    ? String(response.data[0].avatarId)
    : null;
}

/**
 * Avatar id with a per-account cache: a fresh hit skips the request, and when Epic
 * fails (timeout, expired token) the last known avatar is kept instead of the default.
 */
async function resolveAvatarId(
  accountId: string,
  accessToken: string | undefined,
  discordUserId: string,
): Promise<string | null> {
  const cached = avatarIdCache.get(accountId);
  if (cached && Date.now() - cached.fetchedAt < AVATAR_FRESH_TTL_MS) return cached.avatarId;

  let lastError: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const avatarId = await fetchAvatarId(accountId, accessToken);
      avatarIdCache.set(accountId, { avatarId, fetchedAt: Date.now() });
      return avatarId;
    } catch (err: any) {
      lastError = err;
      if (err.response?.status === 401) break; // retrying with the same token is pointless
      if (attempt === 0) await new Promise((r) => setTimeout(r, AVATAR_RETRY_DELAY_MS));
    }
  }

  if (lastError?.code !== 'ECONNABORTED' && lastError?.response?.status !== 401) {
    log.epic.debug({ discordUserId, error: lastError?.message }, 'Error obteniendo avatar de Epic');
  }
  return cached?.avatarId ?? null;
}

/**
 * Obtiene la información del autor (nombre y avatar) de la cuenta principal
 * @param discordUserId ID del usuario de Discord
 * @param accountData Datos de la cuenta (opcional, si ya se tienen)
 * @returns Datos del autor o null si no tiene cuenta
 */
export async function getMainAccountAuthor(
  discordUserId: string,
  accountData?: AccountData
): Promise<AuthorData | null> {
  try {
    let accountId: string;
    let accessToken: string | undefined;
    let displayName: string;
    
    // Si se proporcionan los datos de la cuenta, usarlos directamente
    if (accountData) {
      accountId = accountData.accountId;
      accessToken = accountData.accessToken;
      displayName = accountData.displayName;
    } else {
      // Si no, buscar en la base de datos
      const user = await UsuarioInfo.findOne({ id: discordUserId });
      
      if (!user || !user.deviceAuths || user.deviceAuths.length === 0) {
        return null;
      }
      
      const mainAccount = user.deviceAuths.find((d: any) => d.cuentaMain);
      
      if (!mainAccount) {
        return null;
      }
      
      accountId = mainAccount.accountId;
      accessToken = mainAccount.accessToken;
      displayName = mainAccount.displayName || 'Cuenta main';
    }
    
    const avatarId = await resolveAvatarId(accountId, accessToken, discordUserId);
    const iconURL = avatarIdToIconUrl(avatarId);

    let finalName = displayName || 'Cuenta main';
    if (await shouldMaskDisplayName(discordUserId)) {
      finalName = maskDisplayName(finalName);
    }

    return {
      name: finalName,
      iconURL,
    };
  } catch (error) {
    log.epic.error({ discordUserId, error }, 'Error en getMainAccountAuthor');
    return null;
  }
}
