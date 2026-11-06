/**
 * Keeps the V-Bucks prices + giftbots panels up to date in Glow's server.
 * Mercadona posts the same panels in its own channel; both run independently.
 */

import cron from 'node-cron';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { refreshGiftPanels } from '../../../giftbots/vbucksPanels.ts';

let running = false;

async function safeRefresh(client: ExtendedClient): Promise<void> {
  if (running) return;
  running = true;
  try {
    await refreshGiftPanels(client);
  } catch (err) {
    log.bot.error({ err }, '[GIFT-PANELS] Refresh failed');
  } finally {
    running = false;
  }
}

const event: BotEvent<'clientReady'> = {
  name: 'clientReady',
  once: true,

  async execute(client: ExtendedClient) {
    // Mercadona syncs the giftbot balances every 15 min; read them right after
    cron.schedule('2-59/15 * * * *', () => void safeRefresh(client));
    setTimeout(() => void safeRefresh(client), 20_000).unref?.();
  },
};

export default event;
