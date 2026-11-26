/** Shared Mongo sub-document fields for automation account entries (token failure suspend). */
export const AUTOMATION_ACCOUNT_SUSPENSION_SCHEMA = {
  suspended: { type: Boolean, default: false },
  suspendedReason: { type: String, default: '' },
  suspendedAt: { type: Date, default: null },
} as const;

export type AutomationAccountSuspension = {
  suspended?: boolean;
  suspendedReason?: string;
  suspendedAt?: Date | null;
};

export function isAutomationAccountSuspended(
  account: { isActive?: boolean; suspended?: boolean } | null | undefined,
): boolean {
  if (!account) return false;
  return account.suspended === true;
}

/**
 * A token-failure suspension is retried this long after it was set (or last re-confirmed), so an
 * account suspended by a one-off Epic glitch comes back by itself instead of waiting for the user
 * to run a command. A failed retry re-stamps the suspension (no new DM), so a really broken
 * account costs one refresh attempt per window.
 */
export const AUTOMATION_SUSPENSION_RETRY_MS = 6 * 60 * 60_000;

/** True when a suspension set at `suspendedAt` is old enough to try the account again (no date = retry). */
export function isSuspensionRetryDue(suspendedAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!suspendedAt) return true;
  const at = suspendedAt instanceof Date ? suspendedAt.getTime() : Date.parse(suspendedAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= AUTOMATION_SUSPENSION_RETRY_MS;
}

export function shouldRunAutomationAccount(
  account: { isActive?: boolean; suspended?: boolean; suspendedAt?: Date | string | null } | null | undefined,
): boolean {
  if (!account?.isActive) return false;
  if (account.suspended && !isSuspensionRetryDue(account.suspendedAt)) return false;
  return true;
}

/** Whether the device auth's automation suspension still blocks it (false once the retry window passed). */
export function isDeviceAuthSuspensionActive(
  auth: { automationSuspended?: boolean; automationSuspendedAt?: string | null } | null | undefined,
): boolean {
  return auth?.automationSuspended === true && !isSuspensionRetryDue(auth.automationSuspendedAt);
}

export function shouldProcessAutomationAccount(
  userInfo:
    | { deviceAuths?: { accountId: string; automationSuspended?: boolean; automationSuspendedAt?: string | null }[] }
    | null
    | undefined,
  accountId: string,
  accountData: { isActive?: boolean; suspended?: boolean; suspendedAt?: Date | string | null },
): boolean {
  if (!shouldRunAutomationAccount(accountData)) return false;
  const auth = userInfo?.deviceAuths?.find((a) => a.accountId === accountId);
  if (isDeviceAuthSuspensionActive(auth)) return false;
  return true;
}
