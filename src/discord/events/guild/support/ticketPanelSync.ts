import { Events } from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { syncSupportTicketPanel } from '#helpers/discord/tickets/ticketPanel.ts';

const event: BotEvent<'clientReady'> = {
  name: Events.ClientReady,
  once: true,

  async execute(client: ExtendedClient) {
    setTimeout(() => {
      syncSupportTicketPanel(client).catch((err) => {
        log.events.error({ error: (err as Error).message }, '[SUPPORT_PANEL] Failed to sync panel');
      });
    }, 11_000);
  },
};

export default event;
