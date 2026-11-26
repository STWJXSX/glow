import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { updateCommandsDoc } from '#helpers/core/commandsDoc.ts';
import { log } from '#helpers/core/logger.ts';

const event: BotEvent<'clientReady'> = {
  name: 'clientReady',
  once: true,

  async execute(client: ExtendedClient) {
    await updateCommandsDoc(client).catch((err: any) =>
      log.bot.warn({ error: err?.message }, '[CommandsDoc] Setup failed'),
    );
  },
};

export default event;
