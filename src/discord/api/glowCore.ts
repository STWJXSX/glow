/**
 * Client for Glow Core — the local service that runs Glow's private features.
 *
 * Some commands and background systems are not part of this repository: the bot forwards them to
 * a service on the same machine through this signed local API. Without GLOW_CORE_API_KEY the bot
 * runs normally and those features are simply not registered.
 *
 * Env:
 *   GLOW_CORE_URL       (default http://127.0.0.1:3852)
 *   GLOW_CORE_API_KEY   shared secret, >= 32 chars (same value in the core service)
 */

import { log } from '../helpers/core/logger.ts';
import {
  GLOW_CORE_MIN_KEY_LENGTH,
  signGlowCoreRequest,
  type GlowCoreInteractionEnvelope,
  type GlowCoreMessageEnvelope,
  type GlowCoreManifest,
} from './glowCoreProtocol.ts';

const DEFAULT_URL = 'http://127.0.0.1:3852';
const DEFAULT_TIMEOUT_MS = 15_000;

export class GlowCoreError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

function coreKey(): string | null {
  const key = process.env.GLOW_CORE_API_KEY?.trim();
  return key && key.length >= GLOW_CORE_MIN_KEY_LENGTH ? key : null;
}

function coreUrl(): string {
  return (process.env.GLOW_CORE_URL?.trim() || DEFAULT_URL).replace(/\/+$/, '');
}

let warnedShortKey = false;

/** True when a usable API key is configured. */
export function isGlowCoreEnabled(): boolean {
  const raw = process.env.GLOW_CORE_API_KEY?.trim();
  if (raw && raw.length < GLOW_CORE_MIN_KEY_LENGTH && !warnedShortKey) {
    warnedShortKey = true;
    log.bot.warn(`[GlowCore] GLOW_CORE_API_KEY ignored: must be at least ${GLOW_CORE_MIN_KEY_LENGTH} characters`);
  }
  return coreKey() !== null;
}

async function request<T>(method: 'GET' | 'POST', path: string, payload?: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const key = coreKey();
  if (!key) throw new GlowCoreError('disabled', 'Glow Core is not configured');

  const body = payload === undefined ? '' : JSON.stringify(payload);
  const headers: Record<string, string> = signGlowCoreRequest(key, method, path, body);
  if (body) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${coreUrl()}${path}`, {
      method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new GlowCoreError('unreachable', err instanceof Error ? err.message : String(err));
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON answer: handled below
  }

  if (!res.ok) {
    const error = new GlowCoreError(data?.error ?? `http_${res.status}`, data?.detail?.message);
    // Same fields the original error had (errorCode, response...), so existing catch blocks keep working.
    if (data?.detail && typeof data.detail === 'object') Object.assign(error, data.detail);
    throw error;
  }
  return data as T;
}

/**
 * Calls a function exposed by the core (RPC). Arguments and result must be JSON-serializable.
 * Throws GlowCoreError when the core is disabled, unreachable or the call failed.
 */
export async function callCore<T = unknown>(name: string, ...args: unknown[]): Promise<T> {
  return callCoreWithTimeout<T>(name, DEFAULT_TIMEOUT_MS, ...args);
}

/** callCore for long operations (e.g. waits on Epic). */
export async function callCoreWithTimeout<T = unknown>(name: string, timeoutMs: number, ...args: unknown[]): Promise<T> {
  const res = await request<{ ok: boolean; result?: T; error?: string }>(
    'POST',
    `/v1/rpc/${encodeURIComponent(name)}`,
    { args },
    timeoutMs,
  );
  if (!res?.ok) throw new GlowCoreError(res?.error ?? 'rpc_failed');
  return res.result as T;
}

/** Hands a raw Discord interaction to the core, which answers Discord directly. */
export async function forwardInteraction(envelope: GlowCoreInteractionEnvelope): Promise<void> {
  await request('POST', '/v1/interactions', envelope, 2_500);
}

/** Hands a raw gateway message to the core (only messages that mention the bot). */
export async function forwardMessage(envelope: GlowCoreMessageEnvelope): Promise<void> {
  await request('POST', '/v1/messages', envelope, 2_500);
}

export async function fetchCoreManifest(): Promise<GlowCoreManifest> {
  return request<GlowCoreManifest>('GET', '/v1/manifest', undefined, 5_000);
}

export async function pingCore(): Promise<boolean> {
  try {
    await request('GET', '/v1/health', undefined, 2_000);
    return true;
  } catch {
    return false;
  }
}
