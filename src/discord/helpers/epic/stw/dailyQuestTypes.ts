/** Result shapes of the STW daily quest claim (shared by the bot and glow-core). */

export interface DailyQuestSnapshot {
  itemId: string;
  questKey: string;
  name: string;
}

export interface DailyQuestClaimResult {
  success: boolean;
  questCount: number;
  /** Active dailies were already present before the claim attempt */
  alreadyHadQuests: boolean;
  /** Account has not unlocked daily quests (SSD 3 not completed) */
  dailyQuestsLocked?: boolean;
  errorMessage?: string;
  beforeQuests: DailyQuestSnapshot[];
  afterQuests: DailyQuestSnapshot[];
  /** Quests present after but not before (by quest key) */
  newlyAssignedQuests: DailyQuestSnapshot[];
}

export interface ClaimAllDailiesResult {
  accountId: string;
  displayName: string;
  isMain: boolean;
  result: DailyQuestClaimResult;
}
