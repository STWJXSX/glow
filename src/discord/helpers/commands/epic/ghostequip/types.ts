export type GhostequipPartySummary = {
  accountId: string;
  displayName: string;
  leaderId: string | null;
  isLeader: boolean;
  members: Array<{ id: string; displayName: string }>;
  hiddenMemberIds: string[];
};

export type LeaderCheckResult = { leaderOnly?: boolean } | null;
