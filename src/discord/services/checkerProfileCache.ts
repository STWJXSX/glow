import crypto from 'node:crypto';
import type { SupportedLanguage } from '../helpers/locales/languages.ts';
import type { CheckerImageConfig } from '../helpers/epic/checker/checkerImageConfig.ts';

export interface CheckerAdvancedSettings {
  lockerFilters?: {
    types: string[];
    rarities: string[];
    chapters: string[];
    exclusive: boolean;
  };
  stwFilters?: {
    heroes?: { types: string[]; rarities: string[] };
    survivors?: { types: string[]; rarities: string[] };
    defenders?: { types: string[]; rarities: string[] };
    schematics?: { types: string[]; rarities: string[] };
  };
  branding?: {
    siteUrl?: string;
    footerIconUrl?: string;
  };
}

export interface CachedCheckerRun {
  token: string;
  accountId: string;
  displayName: string;
  accessToken: string;
  lang: SupportedLanguage;
  imageConfig: CheckerImageConfig;
  advancedSettings: CheckerAdvancedSettings;
  athenaData: unknown;
  campaignData: unknown;
  theaterData: unknown | null;
  outpostData: unknown | null;
  campaignProfile: Record<string, unknown>;
  outpostProfile: Record<string, unknown> | null;
  data: Record<string, unknown>;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CachedCheckerRun>();

export function storeCheckerRun(entry: Omit<CachedCheckerRun, 'token' | 'expiresAt'>): string {
  const token = crypto.randomBytes(24).toString('hex');
  cache.set(token, { ...entry, token, expiresAt: Date.now() + CACHE_TTL_MS });
  pruneCache();
  return token;
}

export function getCheckerRun(token: string | undefined | null): CachedCheckerRun | null {
  if (!token) return null;
  const entry = cache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(token);
    return null;
  }
  return entry;
}

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }
  if (cache.size > 200) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < sorted.length - 200; i++) cache.delete(sorted[i][0]);
  }
}
