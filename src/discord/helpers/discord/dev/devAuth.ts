export function getDeveloperIds(): string[] {
  return (process.env.DEVELOPER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isDeveloper(userId: string): boolean {
  return getDeveloperIds().includes(userId);
}

export function getSupportServerId(): string | undefined {
  return process.env.SUPPORT_SERVER?.trim() || undefined;
}

/** Team members that may use /blacklist only (not the rest of the dev tools). */
const BLACKLIST_MANAGER_IDS = [
  '500639528948596738',
  '345349877502574595',
  '545301495512301570',
];

/** Developers plus the fixed managers above plus optional BLACKLIST_MANAGER_IDS (comma-separated). */
export function isBlacklistManager(userId: string): boolean {
  if (isDeveloper(userId) || BLACKLIST_MANAGER_IDS.includes(userId)) return true;
  return (process.env.BLACKLIST_MANAGER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}
