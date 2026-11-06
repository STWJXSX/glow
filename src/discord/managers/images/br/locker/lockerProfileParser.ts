import type { LockerCosmeticType, LockerCosmeticTypeFilter, RawLockerCosmetic } from './types.ts';
import { LOCKER_TEMPLATE_PREFIXES } from './lockerTemplatePrefixes.ts';

export const DEFAULT_OUTFIT_IDS = new Set([
  'cid_defaultoutfit',
  'cid_001_athena_commando_f_default',
  'cid_002_athena_commando_m_default',
]);

export function isDefaultLockerCosmetic(id: string): boolean {
  const lower = id.toLowerCase();
  if (DEFAULT_OUTFIT_IDS.has(lower)) return true;
  return lower.includes('defaultoutfit') || /_default$/i.test(lower);
}

export { isLockerExclusiveCosmeticId as isExclusiveCosmeticId } from './lockerExclusiveIds.ts';

function resolveTypeFromTemplateId(templateId: string): RawLockerCosmetic | null {
  for (const rule of LOCKER_TEMPLATE_PREFIXES) {
    if (!templateId.startsWith(rule.prefix)) continue;

    const id = templateId.slice(rule.prefix.length);
    if (!id) return null;

    return {
      id,
      templateId,
      type: rule.type,
      backendValue: rule.backendValue,
      needsValidation: rule.needsEidResolve ? true : undefined,
      needsEidResolve: rule.needsEidResolve,
    };
  }
  return null;
}

export function parseLockerCosmeticsFromProfile(
  profileBody: unknown,
  types: LockerCosmeticTypeFilter[] = ['outfit'],
): RawLockerCosmetic[] {
  const items = (profileBody as { profileChanges?: { profile?: { items?: Record<string, { templateId?: string }> } }[] })
    ?.profileChanges?.[0]?.profile?.items;
  if (!items) return [];

  const wantAll = types.includes('all');
  const want = new Set(types.filter((t): t is LockerCosmeticType => t !== 'all'));

  const out: RawLockerCosmetic[] = [];
  for (const itemData of Object.values(items)) {
    const templateId = String(itemData?.templateId ?? '');
    if (!templateId) continue;

    const parsed = resolveTypeFromTemplateId(templateId);
    if (!parsed) continue;

    if (!wantAll && !want.has(parsed.type) && !parsed.needsEidResolve) continue;
    if (!wantAll && parsed.needsEidResolve) {
      const wantsAnyEid = want.has('emote') || want.has('spray') || want.has('emoticon') || want.has('toy');
      if (!wantsAnyEid) continue;
    }

    if (parsed.type === 'outfit' && isDefaultLockerCosmetic(parsed.id)) continue;

    parsed.isFavorite = Boolean((itemData as { attributes?: { favorite?: boolean } })?.attributes?.favorite);

    out.push(parsed);
  }
  return out;
}
