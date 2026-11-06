import cron from 'node-cron';

import { cleanupWorldInfoCache } from '#managers/images/stw/world-info/worldInfoCache.ts';
import { log } from '#helpers/core/logger.ts';
import { runMonitoredEpicEvent } from '#helpers/epic/automation/epicEventMonitor.ts';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';

let registered = false;
let worldInfoClient: ExtendedClient | null = null;

function setupWorldInfoCacheCron(client: ExtendedClient): void {
  worldInfoClient = client;
  cron.schedule(
    '0 0 * * *',
    async () => {
      if (!worldInfoClient) return;
      await runMonitoredEpicEvent(worldInfoClient, {
        system: 'worldInfoCache',
        title: 'WorldInfo Cache Cleanup',
        category: 'System',
        schedule: '00:00 UTC',
      }, async () => {
        const removed = cleanupWorldInfoCache();
        log.epic.info({ removed }, '[WorldInfoCache] Daily cleanup (00:00 UTC)');
        return { success: true, stats: { Eliminados: removed } };
      });
    },
    { timezone: 'UTC' },
  );
  log.epic.info('[WorldInfoCache] Cron registered — purge dist cache at 00:00 UTC');
}

const event: BotEvent = {
  name: 'ready',
  once: false,
  async execute(client: ExtendedClient, ..._args: unknown[]) {
    if (registered) return;
    registered = true;
    setupWorldInfoCacheCron(client);
  },
};

export default event;
