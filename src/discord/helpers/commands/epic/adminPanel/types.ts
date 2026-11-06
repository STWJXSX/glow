/** Public shapes/constants of the root-code redemption exposed by Glow Core. */

export type RootResultKind = 'ok' | 'already' | 'invalid' | 'lobbyOnly' | 'error';

export interface RootAccount {
  accountId: string;
  accessToken: string;
}

/** These root codes must be entered in a Fortnite lobby by the player. */
export const LOBBY_ONLY_ROOT_CODES = new Set<string>([
  'LetsBlockAndRoll',
  'DontBlockMe',
]);

export const DEFAULT_ROOT_CODES = [
  'IWannaFlyHigh',
  'GottaGoFast',
  'TakeYourHeart',
  'SurviveTheNight',
  'LetsBlockAndRoll',
  'DontBlockMe',
  'PerfectOrder',
  'O2OVERRIDE',
  'Born2Play',
  'Magilume',
  '8BitBlast',
  'BeMoreAlien',
  'CHISPAMBO',
  'abgestaubt',
  'PERLIMPINPIN',
] as const;

export interface RootRedeemResult {
  code: string;
  kind: RootResultKind;
}
