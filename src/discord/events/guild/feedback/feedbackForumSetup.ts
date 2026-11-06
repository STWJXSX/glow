/**
 * EVENTO feedbackForumSetup
 * On startup: makes sure the feedback forum has its permissions, tags and
 * the pinned (locked) guide post. Idempotent.
 */

import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { ensureFeedbackForumSetup } from '#helpers/discord/feedback/feedbackForum.ts';
import { log } from '#helpers/core/logger.ts';

const event: BotEvent<'clientReady'> = {
  name: 'clientReady',
  once: true,

  async execute(client: ExtendedClient) {
    await ensureFeedbackForumSetup(client).catch((err: any) =>
      log.events.warn({ error: err?.message }, '[FeedbackForum] Setup failed'),
    );
  },
};

export default event;
