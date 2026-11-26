/** Plain data returned by Glow Core party actions. */

export interface PartyMemberInfo {
  id: string;
  displayName: string;
  role: string;
  isLeader: boolean;
}

export interface PartyState {
  id: string;
  size: number;
  maxSize: number;
  isPrivate: boolean;
  leaderId: string | null;
  leaderName: string | null;
  members: PartyMemberInfo[];
}

export type RewardsMap = Record<string, { cantidad: number; emoji: string }>;

export type MissionKickFailureReason =
  | 'outpost'
  | 'lobby'
  | 'not_in_mission'
  | 'party_mates'
  | 'no_bots'
  | 'not_friends'
  | 'busy'
  | 'error';

export type MissionKickResult =
  | { ok: true; bot: string; steps: string[] }
  | {
    ok: false;
    reason: MissionKickFailureReason;
    botNames?: string[];
    detail?: string;
    steps: string[];
  };

export type ResolvePlayerResult =
  | { ok: false; reason: 'userNotFound' }
  | { ok: true; accountId: string; displayName: string };

export type InviteResult =
  | { ok: false; reason: 'alreadyInParty' | 'partyFull'; size?: number; maxSize?: number }
  | { ok: true };

export type PromoteChoicesResult =
  | { ok: false; reason: 'noMembers' }
  | { ok: true; choices: Array<{ name: string; value: string }> };

export type PromoteResult =
  | { ok: false; reason: 'notLeader' | 'memberNotFound' }
  | { ok: true; memberDisplayName: string };

export type PrivacyToggleResult =
  | { ok: false; reason: 'noParty' | 'notLeader' }
  | { ok: true; wasPrivate: boolean };

export interface PrivacySettings {
  partyType: string;
  inviteRestriction: string;
  onlyLeaderFriendsCanJoin: boolean;
}

export interface KickMembersResult {
  isLeader: boolean;
  kickedCount: number;
  kickedNames: string[];
}

export interface GamePanelProfileResult {
  items: Record<string, any>;
  activeLoadoutGuid: string | null;
}
