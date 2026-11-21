import exclusivesMap from './map/exclusives.json' with { type: 'json' };

interface LockerExclusivesFile {
  exclusivos?: string[];
  cosmetics?: Array<{ templateId?: string }>;
}

function buildLockerExclusiveIds(): Set<string> {
  const data = exclusivesMap as LockerExclusivesFile;
  const ids = new Set<string>();

  for (const id of data.exclusivos ?? []) {
    if (id) ids.add(id.toLowerCase());
  }

  for (const entry of data.cosmetics ?? []) {
    const templateId = entry?.templateId;
    if (templateId) ids.add(templateId.toLowerCase());
  }

  return ids;
}

export const LOCKER_EXCLUSIVE_IDS = buildLockerExclusiveIds();

export function isLockerExclusiveCosmeticId(id: string): boolean {
  return LOCKER_EXCLUSIVE_IDS.has(id.toLowerCase());
}
