/**
 * EVENTO feedbackThreadGuard
 * In the feedback forum only the post's author, developers and members with
 * Manage Messages may write; anything else is deleted.
 */

import { Events, PermissionFlagsBits } from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import Feedback from '#models/Feedback.ts';
import { FEEDBACK_FORUM_ID } from '#helpers/discord/feedback/feedbackForum.ts';
import { log } from '#helpers/core/logger.ts';

const DEVELOPER_IDS = (process.env.DEVELOPER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);

/** threadId → author id (null = not a tracked feedback post) */
const ownerCache = new Map<string, string | null>();

async function getOwner(threadId: string): Promise<string | null> {
  if (ownerCache.has(threadId)) return ownerCache.get(threadId)!;
  const fb = await Feedback.findOne({ channelId: threadId }).select('userId').lean();
  const owner = fb?.userId ?? null;
  ownerCache.set(threadId, owner);
  return owner;
}

const event: BotEvent<'messageCreate'> = {
  name: Events.MessageCreate,
  once: false,

  async execute(_client: ExtendedClient, message) {
    const channel = message.channel;
    if (!channel.isThread() || channel.parentId !== FEEDBACK_FORUM_ID) return;
    if (message.author.bot || DEVELOPER_IDS.includes(message.author.id)) return;
    if (message.member?.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) return;

    const owner = await getOwner(channel.id);
    if (owner && owner === message.author.id) return;

    await message.delete().catch((err: any) =>
      log.events.warn({ error: err?.message, threadId: channel.id }, '[FeedbackGuard] Could not delete message'),
    );
  },
};

export default event;
