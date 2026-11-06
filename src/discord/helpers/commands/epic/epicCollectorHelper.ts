/**
 * Epic command component collectors — use Discord `idle` (inactivity timeout)
 * instead of absolute `time`, so menus stay open while the user is active.
 */

export { isCollectorIdle, isCollectorStopped } from './auth/authCollectorHelper.ts';
export {
  editMessageInactive,
  editReplyInactive,
  formatInactiveNotice,
} from './inactiveCollectorHelper.ts';

/** Purchase / gift confirmation — 2 min without interaction */
export const EPIC_CONFIRM_IDLE_MS = 2 * 60 * 1000;

/** Shop browse, STW panels — 15 min without interaction */
export const EPIC_PANEL_IDLE_MS = 15 * 60 * 1000;

/** Paginated lists (gifts, compose MCP, bulk) — 20 min without interaction */
export const EPIC_PAGINATION_IDLE_MS = 20 * 60 * 1000;

/** Short navigation (llamas, outpost, weekly) — 5 min without interaction */
export const EPIC_NAV_IDLE_MS = 5 * 60 * 1000;
