import { callCore, callCoreWithTimeout } from '#api/glowCore.ts';
import { log } from '#helpers/core/logger.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import type { FastSwapRestoreReason, FastSwapRestoreSnapshot } from './fastswapTypes.ts';

const FASTSWAP_RESTORE_MS = 4 * 60_000;
const RESTORE_POLL_MS = 10_000;

const activeRestoreWatches = new Map<string, { cancel: () => void }>();

export function cancelFastSwapRestoreWatch(userId: string): void {
  activeRestoreWatches.get(userId)?.cancel();
  activeRestoreWatches.delete(userId);
}

/** Poll mission state during restore window; restore early if the player leaves the mission. */
export function startFastSwapRestoreWatch(options: {
  userId: string;
  accountId: string;
  lang: SupportedLanguage;
  snapshots: FastSwapRestoreSnapshot[];
  onRestored: (reason: FastSwapRestoreReason) => Promise<void>;
}): void {
  cancelFastSwapRestoreWatch(options.userId);

  let finished = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

  const finish = async (reason: FastSwapRestoreReason) => {
    if (finished) return;
    finished = true;

    if (pollTimer) clearInterval(pollTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    activeRestoreWatches.delete(options.userId);

    let restored = false;
    try {
      const result = await callCoreWithTimeout<{ restored: boolean }>('fastswap.restore', 10 * 60_000, {
        userId: options.userId,
        snapshots: options.snapshots,
        lang: options.lang,
      });
      restored = result.restored === true;
    } catch (error: any) {
      log.commands.error({ userId: options.userId, error: error.message }, '[fastswap] restore job failed');
    }

    if (restored) {
      await options.onRestored(reason).catch((error: any) => {
        log.commands.error({ userId: options.userId, error: error.message }, '[fastswap] restore notify failed');
      });
    }
  };

  pollTimer = setInterval(() => {
    void (async () => {
      try {
        const status = await callCore<{ leftMission: boolean }>('fastswap.restoreStatus', {
          userId: options.userId,
          accountId: options.accountId,
        });
        if (status.leftMission) {
          await finish('left_mission');
        }
      } catch {
        // keep polling until timeout
      }
    })();
  }, RESTORE_POLL_MS);

  timeoutTimer = setTimeout(() => {
    void finish('timeout');
  }, FASTSWAP_RESTORE_MS);

  activeRestoreWatches.set(options.userId, {
    cancel: () => {
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      activeRestoreWatches.delete(options.userId);
      finished = true;
    },
  });
}
