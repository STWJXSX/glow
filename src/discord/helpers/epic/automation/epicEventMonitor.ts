/**
 * Wrapper for scheduled Epic automation events (excludes taxis).
 * Discord start/end logging was removed; events still run through this helper for consistent error handling.
 */

import type { ExtendedClient } from '#structures/types.ts';

export type EpicEventCategory = 'STW' | 'BR' | 'FN' | 'Shop' | 'System';

export interface EpicEventMeta {
  system: string;
  title: string;
  category?: EpicEventCategory;
  schedule?: string;
}

export interface EpicEventRunResult {
  success?: boolean;
  stats?: Record<string, unknown>;
  error?: string;
}

type EpicProcessResult = boolean | EpicEventRunResult | void;

function normalizeResult(raw: EpicProcessResult): EpicEventRunResult {
  if (typeof raw === 'boolean') return { success: raw };
  if (!raw) return { success: true };
  return raw;
}

/** @deprecated No-op; kept for taxi init compatibility. */
export function initEpicEventMonitor(_client: ExtendedClient): void {}

/** @deprecated No-op; kept for taxi init compatibility. */
export function enableEpicEventMonitor(): void {}

export function isEpicEventMonitorActive(): boolean {
  return false;
}

/** Wrap a scheduled Epic event with normalized success/error results. */
export async function runMonitoredEpicEvent(
  _client: ExtendedClient,
  _meta: EpicEventMeta,
  fn: () => Promise<EpicProcessResult>,
): Promise<EpicEventRunResult> {
  try {
    return normalizeResult(await fn());
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
