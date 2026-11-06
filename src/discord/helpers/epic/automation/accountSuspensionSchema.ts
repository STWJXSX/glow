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

export function shouldRunAutomationAccount(
  account: { isActive?: boolean; suspended?: boolean } | null | undefined,
): boolean {
  if (!account?.isActive) return false;
  if (account.suspended) return false;
  return true;
}

export function shouldProcessAutomationAccount(
  userInfo: { deviceAuths?: { accountId: string; automationSuspended?: boolean }[] } | null | undefined,
  accountId: string,
  accountData: { isActive?: boolean; suspended?: boolean },
): boolean {
  if (!shouldRunAutomationAccount(accountData)) return false;
  const auth = userInfo?.deviceAuths?.find((a) => a.accountId === accountId);
  if (auth?.automationSuspended) return false;
  return true;
}
