import type { FriendPresenceSnapshot } from './types.ts';

export interface ParsedFortnitePresence {
  statusText: string;
  activity: string;
  playing: boolean;
  joinable: boolean;
  unjoinableMatch: boolean;
  inZone: boolean;
  platform: string;
  subGameKey: 'br' | 'stw' | 'creative' | 'other';
  partySize: number | null;
  partyMaxSize: number | null;
  partyPrivate: boolean;
  playersAlive: number | null;
  serverPlayerCount: number | null;
  playlist: string;
  playlistId: string;
  island: string;
  gameState: string;
  kills: number | null;
  partyId: string;
  homeBaseRating: number | null;
}

function parseJsonField<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function parseMapProp<T extends Record<string, unknown>>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'object') return value as T;
  const s = String(value).trim();
  if (!s.startsWith('m')) return null;
  return parseJsonField<T>(s.slice(1));
}

function parsePrefixedInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const s = String(value);
  const m = s.match(/^[is](\d+)$/i) ?? s.match(/^(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseBoolProp(value: unknown): boolean {
  if (value === true) return true;
  const s = String(value ?? '').toLowerCase();
  return s === 'true' || s === 'btrue';
}

export function isInFortniteSession(p: ParsedFortnitePresence): boolean {
  if (p.inZone || p.unjoinableMatch) return true;
  if (p.playersAlive != null && p.playersAlive > 0) return true;
  if (p.playlistId !== '—' && p.island !== '—') return true;
  const state = p.gameState.toLowerCase();
  if (state.includes('game') || state === 'ingame') return true;
  return p.playing;
}

export function parseFortnitePresence(snap: FriendPresenceSnapshot | null): ParsedFortnitePresence | null {
  if (!snap) return null;
  const root = snap.status ?? {};
  const props = (root.Properties ?? root.properties ?? {}) as Record<string, unknown>;

  const gameplay = parseJsonField<{
    state?: string;
    playlist?: string;
    numKills?: number;
  }>(props.FortGameplayStats_j) ?? parseMapProp(props.FortGameplayStats_j) ?? undefined;

  const party = parseJsonField<{
    partyId?: string;
    pc?: number;
    bIsPrivate?: boolean;
  }>(props['party.joininfodata.286331153_j'])
    ?? parseJsonField(props['party.joininfodata.286331153'])
    ?? parseMapProp(props['party.joininfodata.286331153_j'])
    ?? parseMapProp(props['party.joininfodata.286331153'])
    ?? undefined;

  const basicInfo = parseMapProp<{ homeBaseRating?: number }>(props.FortBasicInfo);

  const subGame = Number(props.FortSubGame_i ?? props.FortSubGame ?? -1);
  let subGameKey: ParsedFortnitePresence['subGameKey'] = 'other';
  if (subGame === 0) subGameKey = 'stw';
  else if (subGame === 1) subGameKey = 'br';
  else if (subGame === 2) subGameKey = 'creative';

  const partySizeRaw = props.FortPartySize_i ?? props.Event_PartySize ?? party?.pc;
  const partySize = parsePrefixedInt(partySizeRaw);
  const partyMaxSize = parsePrefixedInt(props.Event_PartyMaxSize);
  const playersAlive = parsePrefixedInt(props.Event_PlayersAlive ?? props.ServerPlayerCount);
  const serverPlayerCount = parsePrefixedInt(props.ServerPlayerCount);
  const partyPrivate = Boolean(party?.bIsPrivate)
    || String(props['party.joininfodata.286331153']).includes('"bIsPrivate":true');
  const playlistId = String(props.GamePlaylistName ?? '').trim();
  const island = String(props.IslandCode ?? '').trim();
  const activity = String(root.activity ?? root.Status ?? root.status ?? '').trim();
  const inZone = Boolean(props.IsInZone_b) || String(props.IsInZone) === 'btrue';
  const unjoinableMatch = Boolean(props.InUnjoinableMatch_b) || String(props.InUnjoinableMatch) === 'btrue';
  const playing = Boolean(root.bIsPlaying)
    || parseBoolProp(props.bIsPlaying)
    || inZone
    || unjoinableMatch
    || (playersAlive != null && playersAlive > 0)
    || (playlistId !== '' && island !== '');

  return {
    statusText: activity || String(root.Status ?? root.status ?? '').trim(),
    activity,
    playing,
    joinable: Boolean(root.bIsJoinable) || parseBoolProp(props.bIsJoinable),
    unjoinableMatch,
    inZone,
    platform: String(props['urn:epic:conn:platform_s'] ?? props.EOS_Platform ?? '').trim() || '—',
    subGameKey,
    partySize,
    partyMaxSize,
    partyPrivate,
    playersAlive,
    serverPlayerCount,
    playlist: String(gameplay?.playlist ?? '').trim() || playlistId || '—',
    playlistId: playlistId || '—',
    island: island || '—',
    gameState: String(gameplay?.state ?? '').trim() || '—',
    kills: gameplay?.numKills != null ? Number(gameplay.numKills) : null,
    partyId: String(party?.partyId ?? '').trim(),
    homeBaseRating: basicInfo?.homeBaseRating != null ? Number(basicInfo.homeBaseRating) : null,
  };
}

export function isPresenceOnline(snap: FriendPresenceSnapshot | null): boolean {
  return Boolean(snap?.available);
}

export function isPresenceInGame(parsed: ParsedFortnitePresence | null): boolean {
  if (!parsed) return false;
  return isInFortniteSession(parsed);
}
