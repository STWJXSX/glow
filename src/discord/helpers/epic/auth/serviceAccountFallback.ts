/**
 * Extra service accounts used when deviceAuth.json cannot get a token.
 *
 * The accounts are not stored in this repository: by default they are requested from Glow Core
 * (api/glowCore.ts). A process that owns them can install its own provider instead.
 */

import { log } from '../../core/logger.ts';
import { callCore, isGlowCoreEnabled } from '../../../api/glowCore.ts';

export interface FallbackServiceDevice {
  accountId: string;
  deviceId: string;
  secret: string;
  displayName?: string;
}

const CACHE_TTL_MS = 30 * 60_000;

let provider: (() => Promise<FallbackServiceDevice[]>) | null = null;
let cached: FallbackServiceDevice[] | null = null;
let cachedAt = 0;

export function setFallbackServiceDevicesProvider(fn: () => Promise<FallbackServiceDevice[]>): void {
  provider = fn;
  cached = null;
}

function isDevice(value: unknown): value is FallbackServiceDevice {
  const d = value as FallbackServiceDevice;
  return typeof d?.accountId === 'string' && typeof d.deviceId === 'string' && typeof d.secret === 'string';
}

export async function getFallbackServiceDevices(): Promise<FallbackServiceDevice[]> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  try {
    let devices: unknown[];
    if (provider) devices = await provider();
    else if (isGlowCoreEnabled()) devices = await callCore<unknown[]>('auth.serviceAccounts');
    else return [];

    cached = (Array.isArray(devices) ? devices : []).filter(isDevice);
    cachedAt = Date.now();
    return cached;
  } catch (err) {
    log.epic.warn({ err }, '[ServiceAccount] No se pudieron obtener cuentas de respaldo');
    return cached ?? [];
  }
}
