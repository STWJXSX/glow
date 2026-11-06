export interface LookupLinkedAccount {
  type: string;
  externalDisplayName?: string;
  externalId?: string;
}

/** Result of the core `lookup.run` action. */
export interface LookupRunResult {
  accountId: string;
  displayName: string;
  avatarIconUrl: string;
  externalAuths: LookupLinkedAccount[];
}
