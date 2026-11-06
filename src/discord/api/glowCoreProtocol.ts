/**
 * Glow Core local API — request signing shared by the bot (client) and the core service (server).
 *
 * Every request carries:
 *   x-api-key          GLOW_CORE_API_KEY (compared in constant time)
 *   x-glow-ts          unix ms when the request was signed
 *   x-glow-nonce       random hex, single use inside the clock window
 *   x-glow-signature   hex HMAC-SHA256(key, `${ts}.${nonce}.${METHOD}.${path}.${sha256(body)}`)
 *
 * The key alone is not enough: a captured request cannot be replayed (nonce + window) or altered
 * (body hash is signed).
 */

import crypto from 'node:crypto';

export const GLOW_CORE_HEADERS = {
  apiKey: 'x-api-key',
  timestamp: 'x-glow-ts',
  nonce: 'x-glow-nonce',
  signature: 'x-glow-signature',
} as const;

/** Max clock skew / replay window accepted by the server. */
export const GLOW_CORE_MAX_SKEW_MS = 30_000;

/** Keys shorter than this are refused by both sides. */
export const GLOW_CORE_MIN_KEY_LENGTH = 32;

function sha256Hex(body: string): string {
  return crypto.createHash('sha256').update(body).digest('hex');
}

export function signGlowCoreRequest(
  key: string,
  method: string,
  path: string,
  body: string,
  timestamp = Date.now(),
  nonce = crypto.randomBytes(16).toString('hex'),
): Record<string, string> {
  const payload = `${timestamp}.${nonce}.${method.toUpperCase()}.${path}.${sha256Hex(body)}`;
  const signature = crypto.createHmac('sha256', key).update(payload).digest('hex');
  return {
    [GLOW_CORE_HEADERS.apiKey]: key,
    [GLOW_CORE_HEADERS.timestamp]: String(timestamp),
    [GLOW_CORE_HEADERS.nonce]: nonce,
    [GLOW_CORE_HEADERS.signature]: signature,
  };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export type GlowCoreVerifyResult = { ok: true; nonce: string } | { ok: false; reason: string };

/** Checks key, clock window and signature. Nonce reuse is checked by the caller (it owns the cache). */
export function verifyGlowCoreRequest(
  key: string,
  method: string,
  path: string,
  body: string,
  headers: Record<string, string | string[] | undefined>,
  now = Date.now(),
): GlowCoreVerifyResult {
  const header = (name: string): string => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] ?? '' : value ?? '';
  };

  if (!safeEqual(header(GLOW_CORE_HEADERS.apiKey), key)) return { ok: false, reason: 'bad_key' };

  const timestamp = Number(header(GLOW_CORE_HEADERS.timestamp));
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > GLOW_CORE_MAX_SKEW_MS) {
    return { ok: false, reason: 'stale' };
  }

  const nonce = header(GLOW_CORE_HEADERS.nonce);
  if (!/^[0-9a-f]{32}$/.test(nonce)) return { ok: false, reason: 'bad_nonce' };

  const payload = `${timestamp}.${nonce}.${method.toUpperCase()}.${path}.${sha256Hex(body)}`;
  const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
  if (!safeEqual(header(GLOW_CORE_HEADERS.signature), expected)) return { ok: false, reason: 'bad_signature' };

  return { ok: true, nonce };
}

/** Command metadata the core publishes so the bot can register and gate remote commands. */
export interface GlowCoreCommandManifest {
  json: Record<string, unknown>;
  hasAutocomplete: boolean;
  flags: {
    cooldown?: number;
    devOnly?: boolean;
    devAccess?: 'blacklist';
    auth?: boolean;
    inServer?: boolean;
    prem?: boolean;
    premPro?: boolean;
    premMonthly?: boolean;
    premUltimate?: boolean;
    premYearly?: boolean;
    premImmortal?: boolean;
    premBooster?: boolean;
    automationSystem?: string;
    nodefer?: boolean;
    deferEphemeral?: boolean;
  };
}

export interface GlowCoreManifest {
  version: 1;
  commands: GlowCoreCommandManifest[];
}

/** A gateway MESSAGE_CREATE the core listens to (messages that mention the bot). */
export interface GlowCoreMessageEnvelope {
  raw: Record<string, unknown>;
}

/** State of the interaction when the bot hands it over (the bot may already have deferred it). */
export interface GlowCoreInteractionEnvelope {
  raw: Record<string, unknown>;
  deferred: boolean;
  ephemeral: boolean;
}
