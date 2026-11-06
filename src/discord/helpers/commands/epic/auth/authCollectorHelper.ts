/**
 * Auth command component collectors — use Discord `idle` (inactivity timeout)
 * instead of absolute `time`, so menus stay open while the user is active.
 *
 * @see https://discord.js.org/docs/packages/discord.js/main/MessageComponentCollectorOptions:Interface
 */

/** Select menus (/switch, /logout) — 2 min without interaction */
export const AUTH_MENU_IDLE_MS = 120_000;

/** Login method pickers, TOS — 3 min without interaction */
export const AUTH_FLOW_IDLE_MS = 180_000;

/** One-shot post-login prompts — 1 min without interaction */
export const AUTH_PROMPT_IDLE_MS = 60_000;

/** Collector ended because the user stopped interacting. */
export function isCollectorIdle(reason: string): boolean {
  return reason === 'idle';
}

/** Collector ended after an explicit stop (e.g. logout completed). */
export function isCollectorStopped(reason: string, stopReason: string): boolean {
  return reason === stopReason;
}
