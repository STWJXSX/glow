/**
 * FEEDBACK FORUM
 * Each bug report / suggestion becomes a forum post (with status tags) in
 * FEEDBACK_FORUM_ID, plus an optional Trello card.
 *
 * The post's starter message id equals the thread id, so Feedback.messageId
 * and Feedback.channelId both store the thread id.
 */

import { ChannelFlags, ChannelType, MessageFlags, type ForumChannel, type ThreadChannel, type GuildForumTagData } from 'discord.js';
import type { ExtendedClient } from '#structures/types.ts';
import type { FeedbackStatus, FeedbackType } from '#models/Feedback.ts';
import { log } from '#helpers/core/logger.ts';

export const FEEDBACK_FORUM_ID = process.env.FEEDBACK_FORUM_ID ?? '1552249984580198430';

const TAGS = {
  bugreport: { name: 'Bug', emoji: '🐛' },
  suggestion: { name: 'Suggestion', emoji: '💡' },
  pending: { name: 'Pending', emoji: '🕓' },
  accepted: { name: 'Accepted', emoji: '✅' },
  investigating: { name: 'Investigating', emoji: '🔍' },
  found: { name: 'Found', emoji: '🎯' },
  resolved: { name: 'Resolved', emoji: '🛠️' },
  implemented: { name: 'Implemented', emoji: '🚀' },
  rejected: { name: 'Rejected', emoji: '❌' },
  guide: { name: 'Guide', emoji: '📌' },
} as const;

type TagKey = keyof typeof TAGS;

export async function getFeedbackForum(client: ExtendedClient): Promise<ForumChannel | null> {
  const ch = await client.channels.fetch(FEEDBACK_FORUM_ID).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildForum) {
    log.events.warn({ forumId: FEEDBACK_FORUM_ID }, '[FeedbackForum] Not found or not a forum');
    return null;
  }
  return ch as ForumChannel;
}

/** Creates any missing status/type tags and returns name → id. */
export async function ensureTags(forum: ForumChannel): Promise<Map<TagKey, string>> {
  const missing = (Object.keys(TAGS) as TagKey[]).filter(
    (k) => !forum.availableTags.some((t) => t.name === TAGS[k].name),
  );
  if (missing.length) {
    const existing: GuildForumTagData[] = forum.availableTags.map((t) => ({
      id: t.id, name: t.name, moderated: t.moderated, emoji: t.emoji,
    }));
    const added: GuildForumTagData[] = missing.map((k) => ({ name: TAGS[k].name, emoji: { id: null, name: TAGS[k].emoji } }));
    await forum.setAvailableTags([...existing, ...added].slice(0, 20)).catch((e) =>
      log.events.warn({ error: e?.message }, '[FeedbackForum] Could not create tags'),
    );
  }
  const map = new Map<TagKey, string>();
  for (const k of Object.keys(TAGS) as TagKey[]) {
    const tag = forum.availableTags.find((t) => t.name === TAGS[k].name);
    if (tag) map.set(k, tag.id);
  }
  return map;
}

function tagIds(map: Map<TagKey, string>, type: FeedbackType, status: FeedbackStatus): string[] {
  // Suggestions are "Implemented" instead of "Resolved"
  const statusKey: TagKey = status === 'resolved' && type === 'suggestion' ? 'implemented' : status;
  return [map.get(type), map.get(statusKey)].filter((x): x is string => !!x);
}

export interface FeedbackPostInput {
  type: FeedbackType;
  title: string;
  /** Components V2 payload (container JSON) for the starter message */
  components: any[];
  /** Discord id of the author; added to the post so they can reply in it */
  authorId: string;
}

/** Creates the forum post. Returns the thread, or null if the forum is unavailable. */
export async function createFeedbackPost(client: ExtendedClient, input: FeedbackPostInput): Promise<ThreadChannel | null> {
  const forum = await getFeedbackForum(client);
  if (!forum) return null;
  const tags = await ensureTags(forum);
  const prefix = input.type === 'bugreport' ? '[Bug]' : '[Suggestion]';

  const thread = await forum.threads.create({
    name: `${prefix} ${input.title}`.slice(0, 100),
    appliedTags: tagIds(tags, input.type, 'pending'),
    message: { components: input.components, flags: MessageFlags.IsComponentsV2 } as any,
    reason: 'User feedback',
  });
  // Join the author to the post (they get notified and can reply)
  await thread.members.add(input.authorId).catch((e: any) =>
    log.events.warn({ error: e?.message, authorId: input.authorId }, '[FeedbackForum] Could not add author to post'),
  );
  return thread;
}

const TUTORIAL_TITLE = '📌 How to send a suggestion or bug report';

const TUTORIAL_TEXT = [
  '# How to send a suggestion or bug report',
  '**Do not create posts in this forum.** Posts are created automatically by the bot.',
  '',
  '## How to send one',
  '1. Use **`/suggestion`** for an idea or **`/report bugs`** for a bug. It works in any server or in DMs with the bot.',
  '2. Fill in the form: title, description and an optional screenshot URL. Any language is fine; it is translated to English automatically.',
  '3. The bot opens a post here with your text. You are added to it automatically.',
  '',
  '## Adding more info',
  'Only **you** (the author) and the team can write in your post. Reply there to add details, screenshots or updates.',
  '',
  '## What the tags mean',
  '🕓 **Pending** — waiting for review',
  '✅ **Accepted** — approved by the team',
  '🔍 **Investigating** — bugs: we are looking into it',
  '🎯 **Found** — bugs: we found the cause',
  '🛠️ **Resolved** — bugs: fixed',
  '🚀 **Implemented** — suggestions: now in the bot',
  '❌ **Rejected** — not going ahead (the post is closed)',
  '',
  'You will get a **DM** in your own language every time the status changes.',
].join('\n');

/**
 * Idempotent forum setup: permissions, tags and the pinned guide post.
 * Members can read and reply in threads but cannot create posts.
 */
export async function ensureFeedbackForumSetup(client: ExtendedClient): Promise<void> {
  const forum = await getFeedbackForum(client);
  if (!forum) return;

  try {
    await forum.permissionOverwrites.edit(
      forum.guild.roles.everyone,
      { CreatePublicThreads: false, SendMessagesInThreads: true },
      { reason: 'Feedback forum: posts are created by the bot only' },
    );
    if (client.user) {
      await forum.permissionOverwrites.edit(client.user.id, {
        ViewChannel: true,
        CreatePublicThreads: true,
        SendMessages: true,
        SendMessagesInThreads: true,
        ManageThreads: true,
      });
    }
  } catch (err: any) {
    log.events.warn({ error: err?.message }, '[FeedbackForum] Could not set forum permissions');
  }

  try {
    const tags = await ensureTags(forum);
    const guideTag = tags.get('guide');

    const active = await forum.threads.fetchActive().catch(() => null);
    const archived = await forum.threads.fetchArchived().catch(() => null);
    let guide = active?.threads.find((t) => t.name === TUTORIAL_TITLE)
      ?? archived?.threads.find((t) => t.name === TUTORIAL_TITLE)
      ?? null;

    if (!guide) {
      guide = await forum.threads.create({
        name: TUTORIAL_TITLE,
        appliedTags: guideTag ? [guideTag] : [],
        message: { content: TUTORIAL_TEXT },
        reason: 'Feedback forum guide',
      });
      log.events.info({ threadId: guide.id }, '[FeedbackForum] Guide post created');
    }
    if (guide.archived) await guide.setArchived(false);
    if (!guide.flags.has(ChannelFlags.Pinned)) await guide.pin();
    if (!guide.locked) await guide.setLocked(true);
  } catch (err: any) {
    log.events.warn({ error: err?.message }, '[FeedbackForum] Guide post setup failed');
  }
}

/** Swaps status tag, posts a note and closes the post when rejected/resolved. Call after editing the starter message. */
export async function applyFeedbackStatus(
  client: ExtendedClient,
  threadId: string,
  type: FeedbackType,
  status: FeedbackStatus,
  note: string,
): Promise<void> {
  try {
    const thread = await client.channels.fetch(threadId).catch(() => null);
    if (!thread || !thread.isThread()) return;
    const forum = await getFeedbackForum(client);
    if (forum) {
      const tags = await ensureTags(forum);
      await thread.setAppliedTags(tagIds(tags, type, status));
    }
    await thread.send({ content: note });
    if (status === 'rejected' || status === 'resolved') {
      await thread.setLocked(true);
      await thread.setArchived(true);
    }
  } catch (err: any) {
    log.events.warn({ error: err?.message, threadId }, '[FeedbackForum] applyFeedbackStatus failed');
  }
}
