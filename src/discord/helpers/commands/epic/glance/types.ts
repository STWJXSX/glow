export interface FortniteGlobalProfile {
  accountId: string;
  seasonLevel?: number;
  playRegion?: string;
  hasBattlePass?: boolean;
  hasCrewMembership?: boolean;
  languages?: string[];
}

export interface GlanceTarget {
  accountId: string;
  displayName: string;
}

/** Result of the core `glance.run` action. */
export interface GlanceRunResult {
  target: GlanceTarget;
  profile: FortniteGlobalProfile | null;
  thumbnail: string;
}
