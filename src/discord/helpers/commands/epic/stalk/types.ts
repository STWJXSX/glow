import type {
  MmSessionData,
  getSessionEndpoints,
} from '#helpers/commands/discord/matchmaking/mmSession.ts';
import type { ParsedFortnitePresence } from './stalkPresence.ts';

export interface FriendPresenceSnapshot {
  viewerAccountId: string;
  accountId: string;
  available: boolean;
  show: string;
  status: Record<string, unknown>;
  updatedAt: number;
}

export interface StalkFriendship {
  mutual: number;
  created: string;
  isFriend: boolean;
}

export interface StalkInteraction {
  type: string;
  happenedAt: number;
  count: number;
}

export interface StalkSessionResult {
  targetAccountId: string;
  targetDisplayName: string;
  targetAvatarUrl: string;
  friendship: StalkFriendship | null;
  lastOnline: string | null;
  interaction: StalkInteraction | null;
  presence: FriendPresenceSnapshot | null;
  parsedPresence: ParsedFortnitePresence | null;
  session: MmSessionData | null;
  sessionEndpoints: ReturnType<typeof getSessionEndpoints> | null;
  privatePlayers: string[];
  state: 'inMatch' | 'online' | 'offline' | 'unknown';
}

/** Result of the core `stalk.run` action. */
export type StalkRunResult = StalkSessionResult & {
  privatePlayerNames: Record<string, string>;
};
