/**
 * EVENTO docsForumSetup
 * On startup: creates/updates the "Glow in Fortnite" docs post in the docs
 * forum (DOCS_FORUM_ID). The "Ventures Taxis" post is handled by the taxi
 * status monitor. Edits happen in place, so nothing is re-posted or pinged.
 */

import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { updateCommandsDoc } from '#helpers/core/docsForum.ts';
import { log } from '#helpers/core/logger.ts';

const event: BotEvent<'clientReady'> = {
  name: 'clientReady',
  once: true,

  async execute(client: ExtendedClient) {
    await updateCommandsDoc(client).catch((err: any) =>
      log.bot.warn({ error: err?.message }, '[DocsForum] Setup failed'),
    );
  },
};

export default event;
