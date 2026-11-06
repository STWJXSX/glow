import axios from 'axios';
import { endpoints } from '#helpers/core/endpoints.ts';

export interface FortniteSanctionFlags {
  activeSanctions: boolean;
  fnEntitlementBan: boolean;
  epicSocialBan: boolean;
  fnMatchmakingBan: boolean;
}

export interface LightswitchFortniteStatus {
  banned?: boolean;
  allowedActions?: string[];
  status?: string;
  message?: string;
}

interface CommonCoreBanStatus {
  bBanHasStarted?: boolean;
  banDurationDays?: number;
  banStartTimeUtc?: string;
}

const EOS_SANCTIONS_ACTIVE = 'https://api.epicgames.dev/sanctions/v1/productUser';

export function isActiveCommonCoreMatchmakingBan(banStatus?: CommonCoreBanStatus | null): boolean {
  if (!banStatus?.bBanHasStarted) return false;
  const days = Number(banStatus.banDurationDays ?? 0);
  if (days <= 0) return false;
  const startRaw = banStatus.banStartTimeUtc;
  if (!startRaw) return true;
  const startMs = Date.parse(startRaw);
  if (Number.isNaN(startMs)) return true;
  return Date.now() < startMs + days * 86_400_000;
}

export async function fetchFortniteLightswitchStatus(
  accessToken: string,
): Promise<LightswitchFortniteStatus | null> {
  const { data } = await axios.get<LightswitchFortniteStatus>(endpoints.LIGHTSWITCH_STATUS, {
    headers: {
      Authorization: `bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 10_000,
  });
  return data ?? null;
}

export async function fetchEosActiveSanctionActions(accessToken: string, accountId: string): Promise<string[]> {
  try {
    const { data } = await axios.get<{ elements?: Array<{ action?: string }> }>(
      `${EOS_SANCTIONS_ACTIVE}/${accountId}/active`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        timeout: 8_000,
      },
    );
    if (!Array.isArray(data?.elements)) return [];
    return data.elements.map((e) => e.action).filter((a): a is string => typeof a === 'string' && a.length > 0);
  } catch {
    return [];
  }
}

export function deriveFortniteSanctionFlags(
  commonAttributes: Record<string, unknown> | undefined,
  lightswitch: LightswitchFortniteStatus | null,
  eosSanctionActions: string[] = [],
): FortniteSanctionFlags {
  const banStatus = commonAttributes?.ban_status as CommonCoreBanStatus | undefined;
  const profileMatchmakingBan = isActiveCommonCoreMatchmakingBan(banStatus);

  const eos = new Set(eosSanctionActions);
  const allowed = new Set((lightswitch?.allowedActions ?? []).map((a) => a.toUpperCase()));
  const lsBanned = lightswitch?.banned === true;

  const fnEntitlementBan = lsBanned || eos.has('fnEntitlementBan');
  const epicSocialBan = eos.has('epicSocialBan');
  const lightswitchMatchmakingBan = allowed.size > 0 && !allowed.has('PLAY');
  const fnMatchmakingBan =
    profileMatchmakingBan || eos.has('fnMatchmakingBan') || lightswitchMatchmakingBan;

  const activeSanctions =
    fnEntitlementBan || epicSocialBan || fnMatchmakingBan || eos.size > 0;

  return {
    activeSanctions,
    fnEntitlementBan,
    epicSocialBan,
    fnMatchmakingBan,
  };
}

export async function fetchFortniteSanctionFlags(
  accessToken: string,
  accountId: string,
  commonAttributes?: Record<string, unknown>,
): Promise<FortniteSanctionFlags> {
  const [lightswitch, eosActions] = await Promise.all([
    fetchFortniteLightswitchStatus(accessToken).catch(() => null),
    fetchEosActiveSanctionActions(accessToken, accountId),
  ]);
  return deriveFortniteSanctionFlags(commonAttributes, lightswitch, eosActions);
}
