import type {
  IAccountSecurity,
  IAccountSecuritySnapshot,
  IAutoSecuritySettings,
} from '#models/AutoSecuritySystem.ts';
import { DEFAULT_AUTO_SECURITY_SETTINGS, emptySnapshot } from './types.ts';

export function resolveSettings(data: Partial<IAccountSecurity>): IAutoSecuritySettings {
  return { ...DEFAULT_AUTO_SECURITY_SETTINGS, ...(data.settings ?? {}) };
}

function normalizeDeviceLocations(
  raw: IAccountSecuritySnapshot['deviceLastLocations'] | Map<string, string> | undefined,
): Record<string, string> {
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  return { ...raw };
}

export function resolveSnapshot(data: Partial<IAccountSecurity>): IAccountSecuritySnapshot {
  if (data.snapshot && data.snapshot.knownDeviceIds) {
    return {
      ...emptySnapshot(),
      ...data.snapshot,
      deviceLastLocations: normalizeDeviceLocations(data.snapshot.deviceLastLocations as any),
      knownCountries: data.snapshot.knownCountries ?? [],
      externalAuthKeys: data.snapshot.externalAuthKeys ?? [],
    };
  }

  const base = emptySnapshot();
  if (data.knownDeviceIds?.length) {
    base.knownDeviceIds = [...data.knownDeviceIds];
  }
  return base;
}

export function mergeSnapshotUpdate(
  previous: IAccountSecuritySnapshot,
  next: IAccountSecuritySnapshot,
): IAccountSecuritySnapshot {
  const countries = new Set([...previous.knownCountries, ...next.knownCountries]);
  for (const c of next.knownCountries) countries.add(c);

  return {
    ...next,
    knownCountries: [...countries],
  };
}
