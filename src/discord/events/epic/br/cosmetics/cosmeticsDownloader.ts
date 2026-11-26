import cron from 'node-cron';

import { log } from '#helpers/core/logger.ts';
import { runMonitoredEpicEvent } from '#helpers/epic/automation/epicEventMonitor.ts';
import {
  COSMETICS_SYNC_CRON_UTC,
  syncCosmeticsCache,
} from '#managers/images/br/locker/cosmeticsSync.ts';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';

let cosmeticsClient: ExtendedClient | null = null;

function setupCosmeticsCron(client: ExtendedClient): void {
  cosmeticsClient = client;
  log.epic.info('[COSMETICS] Scheduling daily full sync at 21:00 UTC (before shop reset)');

  cron.schedule(
    COSMETICS_SYNC_CRON_UTC,
    async () => {
      if (!cosmeticsClient) return;
      await runMonitoredEpicEvent(cosmeticsClient, {
        system: 'cosmeticsSync',
        title: 'Cosmetics Sync',
        category: 'Shop',
        schedule: '21:00 UTC',
      }, async () => {
        log.epic.info('[COSMETICS] Daily full sync start (21:00 UTC)');
        const result = await syncCosmeticsCache();

        if (result.success) {
          log.epic.info(
            `[COSMETICS] Daily sync ok · json ${result.jsonFiles} · img +${result.downloaded} skip ${result.skipped} fail ${result.failed}`,
          );
        } else {
          log.epic.error(`[COSMETICS] Daily sync finished with errors: ${result.error ?? result.failed}`);
        }

        return {
          success: result.success,
          stats: {
            JSON: result.jsonFiles,
            Variantes: result.imageVariants,
            Descargados: result.downloaded,
            Omitidos: result.skipped,
            Fallos: result.failed,
          },
          error: result.error,
        };
      });
    },
    { timezone: 'UTC' },
  );

  log.epic.info('[COSMETICS] Cron registered (21:00 UTC only, no boot download)');
}

const event: BotEvent = {
  name: 'ready',
  once: false,
  async execute(client: ExtendedClient, ..._args: unknown[]) {
    if (!event.once) {
      event.once = true;
      setupCosmeticsCron(client);
    }
  },
};

export default event;

export { syncCosmeticsCache, syncCosmeticsCache as syncCosmeticsPortraits };
