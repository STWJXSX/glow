import type { RawLockerCosmetic, LockerCosmeticType } from './types.ts';
import type { FortniteApiCosmetic } from './lockerCosmeticApi.ts';

const EID_BACKEND_TO_TYPE: Record<string, { type: LockerCosmeticType; backendValue: string }> = {
  AthenaDance: { type: 'emote', backendValue: 'AthenaDance' },
  AthenaSpray: { type: 'spray', backendValue: 'AthenaSpray' },
  AthenaEmoji: { type: 'emoticon', backendValue: 'AthenaEmoji' },
  AthenaToy: { type: 'toy', backendValue: 'AthenaToy' },
};

export function resolveEidLockerCosmetic(
  cosmeticId: string,
  catalog: Map<string, FortniteApiCosmetic>,
): RawLockerCosmetic | null {
  const row = catalog.get(cosmeticId.toLowerCase());
  if (!row) return null;

  const mapped = EID_BACKEND_TO_TYPE[row.backendType];
  if (!mapped) return null;

  return {
    id: cosmeticId,
    templateId: `AthenaDance:${cosmeticId}`,
    type: mapped.type,
    backendValue: mapped.backendValue,
    needsValidation: true,
  };
}

export function enrichRawLockerCosmetics(
  raw: RawLockerCosmetic[],
  catalog: Map<string, FortniteApiCosmetic>,
): RawLockerCosmetic[] {
  const out: RawLockerCosmetic[] = [];

  for (const item of raw) {
    if (item.needsEidResolve) {
      const resolved = resolveEidLockerCosmetic(item.id, catalog);
      if (resolved) out.push(resolved);
      continue;
    }
    out.push(item);
  }

  return out;
}

export function filterRawLockerByTypes(
  raw: RawLockerCosmetic[],
  types: import('./types.ts').LockerCosmeticTypeFilter[],
): RawLockerCosmetic[] {
  if (types.includes('all')) return raw;
  const want = new Set(types.filter((t): t is LockerCosmeticType => t !== 'all'));
  return raw.filter((item) => want.has(item.type));
}
