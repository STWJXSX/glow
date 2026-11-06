import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';

export interface MmSessionData {
  id: string;
  ownerId?: string;
  serverAddress?: string;
  serverPort?: string | number;
  totalPlayers?: number;
  started?: boolean;
  publicPlayers?: string[];
  privatePlayers?: string[];
  attributes?: Record<string, unknown>;
}

export function extractSessionFromFindPlayer(data: unknown): MmSessionData | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    const first = data[0];
    return first?.id ? (first as MmSessionData) : null;
  }
  if (typeof data === 'object' && (data as MmSessionData).id) {
    return data as MmSessionData;
  }
  return null;
}

export async function fetchSelfMatchmakingSession(
  accountId: string,
  accessToken: string,
): Promise<unknown> {
  const { data } = await axios.get(`${Endpoints.MATCHMAKING}/${accountId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15_000,
  });
  return data;
}

function attrString(attrs: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = attrs[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value);
    }
  }
  return 'N/A';
}

export function formatIpPort(ip: string, port: string | number | undefined): string {
  if (!ip || ip === 'N/A') return 'N/A';
  if (port === undefined || port === null || port === 'N/A' || port === '') {
    return `\`${ip}\``;
  }
  return `\`${ip}:${port}\``;
}

export interface ParsedBucketInfo {
  typeKey: 'ranked' | 'public' | 'stw' | 'creative' | 'other';
  region?: string;
  subregion?: string;
  raw: string;
}

export function parseBucketInfo(bucket: string, playlist = ''): ParsedBucketInfo {
  const raw = bucket || 'N/A';
  const upper = `${raw} ${playlist}`.toUpperCase();

  let typeKey: ParsedBucketInfo['typeKey'] = 'other';
  if (upper.includes('RANKED') || upper.includes('HABANERO')) typeKey = 'ranked';
  else if (upper.includes('STW') || upper.includes('FORTPVE') || upper.includes('CAMPAIGN') || upper.includes('FORTEMPTY')) {
    typeKey = 'stw';
  } else if (upper.includes('CREATIVE') || upper.includes('PLAYSET')) typeKey = 'creative';
  else if (upper.includes('BRCORE') || upper.includes('SUNFLOWER') || upper.includes('DEFAULT')) typeKey = 'public';

  const subFromAttr = raw.match(/-(EU|NA|OCE|BR|ME|ASIA)-([A-Z]{2})-/i);
  const rankedSub = raw.match(/BRCORE-(?:RANKED|PUBLIC)-([A-Z]{2})-/i);
  const stwSub = raw.match(/STW-([A-Z]{2})-/i);

  const subregion = subFromAttr?.[2] ?? rankedSub?.[1] ?? stwSub?.[1];
  const region = subFromAttr?.[1] ?? (subregion ? 'EU' : undefined);

  return { typeKey, region, subregion, raw };
}

export function getSessionEndpoints(session: MmSessionData) {
  const attrs = session.attributes ?? {};
  const region = attrString(attrs, 'REGION_s', 'region_s');
  const subRegion = attrString(attrs, 'SUBREGION_s', 'subregion_s');
  const gameMode = attrString(attrs, 'GAMEMODE_s', 'gamemode_s');
  const playlist = attrString(attrs, 'PLAYLISTNAME_s', 'playlistname_s');
  const bucket = attrString(attrs, 'BUCKET_s', 'bucket_s');

  const dsIp = session.serverAddress || attrString(attrs, 'SERVERADDRESS_s', 'serverAddress_s');
  const dsPort = session.serverPort ?? attrs.serverPort_s ?? attrs.SERVERPORT_s;
  const cfIp = attrString(attrs, 'ADDRESS_s', 'address_s');
  const cfPort = attrs.BEACONPORT_i ?? attrs.beaconPort_i;

  return {
    region,
    subRegion,
    gameMode,
    playlist,
    bucket,
    bucketInfo: parseBucketInfo(bucket, playlist),
    dsEndpoint: formatIpPort(dsIp, dsPort as string | number | undefined),
    cfEndpoint: formatIpPort(cfIp, cfPort as string | number | undefined),
  };
}

export async function lookupAccountDisplayNames(
  accountIds: string[],
  accessToken: string,
  batchSize = 3,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(accountIds.filter(Boolean))];
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const qs = batch.map((id) => `accountId=${encodeURIComponent(id)}`).join('&');
    try {
      const { data } = await axios.get<Array<{ id: string; displayName?: string }>>(
        `${Endpoints.ACCOUNT_PUBLIC}?${qs}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10_000,
        },
      );
      for (const acc of data ?? []) {
        map.set(acc.id, acc.displayName || acc.id);
      }
    } catch {
      for (const id of batch) map.set(id, id);
    }
  }

  for (const id of unique) {
    if (!map.has(id)) map.set(id, id);
  }

  return map;
}
