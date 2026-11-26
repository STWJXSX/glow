/**
 * Keeps the English shop catalog used by /giftbot autocomplete warm, so the
 * autocomplete never has to download the shop inside Discord's 3s window.
 */

import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { startShopCatalogWarmer } from '../../../giftbots/fortniteShopCatalog.ts';
import { isGiftbotsEnabled } from '#helpers/core/config/giftbots.ts';

const event: BotEvent<'clientReady'> = {
  name: 'clientReady',
  once: true,

  async execute(_client: ExtendedClient) {
    if (!isGiftbotsEnabled()) return;
    startShopCatalogWarmer();
  },
};

export default event;
