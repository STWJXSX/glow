/**
 * Info command component collectors — use Discord `idle` (inactivity timeout)
 * instead of absolute `time`, so pagination stays open while the user is active.
 */

export { isCollectorIdle, isCollectorStopped } from '#helpers/commands/epic/auth/authCollectorHelper.ts';

/** Paginated embeds (/resources, bulk paginator) — 20 min without interaction */
export const INFO_PAGINATION_IDLE_MS = 20 * 60 * 1000;

/** STW alerts navigation — 5 min without interaction */
export const INFO_ALERTS_IDLE_MS = 5 * 60 * 1000;

/** Checker control panel — 15 min without interaction */
export const INFO_PANEL_IDLE_MS = 15 * 60 * 1000;
