/**
 * DOCS FORUM
 * One forum channel (DOCS_FORUM_ID) with two permanent documentation posts:
 *   - 'taxis':    "Ventures Taxis"    → taxi info image + live taxi status (see statusMonitor.ts)
 *   - 'commands': "Glow in Fortnite"  → in-game (FNChat) command docs
 * Posts are created if missing and always updated in place (edits never ping).
 *
 * Env:
 *   DOCS_FORUM_ID — forum channel id (default below)
 */

import { ChannelFlags, ChannelType, EmbedBuilder, type ForumChannel, type ThreadChannel } from 'discord.js';
import type { ExtendedClient } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';

const DOCS_FORUM_ID = process.env.DOCS_FORUM_ID ?? '1559855420594462770';

export const TAXI_INFO_IMAGE_URL =
  'https://cdn.discordapp.com/attachments/1444045132449054844/1526727091293388912/image.png?ex=6a5812e7&is=6a56c167&hm=733a55ec00b08560e3e37456a13b5f00c8aac586a279f486c9e3504985aea839&';

export type DocKind = 'taxis' | 'commands';

const DOCS: Record<DocKind, { name: string; legacyNames: string[] }> = {
  taxis: { name: 'Ventures Taxis', legacyNames: ['Taxi sessions'] },
  commands: { name: 'Glow in Fortnite', legacyNames: ['In-game commands'] },
};

// ── In-game commands doc ────────────────────────────────────────────────

const COMMAND_DOCS: Array<[name: string, description: string]> = [
  ['dupe', 'dupe in your Save the World lobby once you are in-game'],
  ['gvbucks', 'see daily V-Bucks alerts'],
  ['llamas', 'open every llama on the account at once'],
  ['outpost', 'view everyone with permissions in your SSD'],
  ['skip', 'skip the STW tutorial'],
  ['spoof', 'spoof your power level to 288 in the lobby for 60s'],
  ['weekly', 'view weekly quests and reroll'],
];

let botIdentity: { name: string; accountId: string } = {
  name: 'Glow Bot',
  accountId: process.env.FNCHAT_ACCOUNT_ID ?? '',
};

function buildCommandsEmbed(): EmbedBuilder {
  const list = COMMAND_DOCS.map(([name, desc], i) => `${i + 1}. \`${name}\` *(${desc})*`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle('Current Commands')
    .setDescription(`${list}\n\n-# System available for **Premium users only** (Boosters excluded).`)
    .addFields(
      {
        name: '⚠️ Use commands on another account',
        value:
          'You can run any command on another Epic account linked to your Discord.\n'
          + '```\ndupe --accmain\ndupe --accYourDisplayName\n```'
          + 'Use `--accmain` for your main account, or `--acc` followed by the Epic display name (no space).',
      },
      {
        name: 'Fortnite Chat Commands 🔥',
        value:
          'Add the bot as a friend in **Fortnite**, then DM it (or write in its party chat) '
          + 'to run commands through FNChat. Reply comes back in the same chat.',
      },
      { name: 'FN / EPIC BOT', value: `**${botIdentity.name}**` },
    );
  if (botIdentity.accountId) {
    embed.addFields({ name: 'Epic Account ID', value: `\`\`\`\n${botIdentity.accountId}\n\`\`\`` });
  }
  return embed.setFooter({ text: 'Glow · in-game commands' });
}

// ── Posts ───────────────────────────────────────────────────────────────

function starterEmbed(kind: DocKind): EmbedBuilder {
  return kind === 'taxis' ? new EmbedBuilder().setImage(TAXI_INFO_IMAGE_URL) : buildCommandsEmbed();
}

const posts = new Map<DocKind, Promise<ThreadChannel | null>>();

async function resolvePost(client: ExtendedClient, kind: DocKind): Promise<ThreadChannel | null> {
  const forum = await client.channels.fetch(DOCS_FORUM_ID).catch(() => null);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    log.bot.warn({ forumId: DOCS_FORUM_ID }, '[DocsForum] Channel not found or not a forum');
    return null;
  }
  const f = forum as ForumChannel;
  const { name, legacyNames } = DOCS[kind];
  const names = [name, ...legacyNames];

  const active = await f.threads.fetchActive().catch(() => null);
  const archived = await f.threads.fetchArchived().catch(() => null);
  const all = [...(active?.threads.values() ?? []), ...(archived?.threads.values() ?? [])];
  // Prefer the current name, then a legacy one (renamed below)
  let thread = names.map((n) => all.find((t) => t.name === n)).find(Boolean) ?? null;

  if (thread) {
    if (thread.archived) await thread.setArchived(false).catch(() => null);
    if (thread.name !== name) await thread.setName(name).catch(() => null);
  } else {
    // Forums with "require tag" reject posts without one: make sure a tag exists
    let appliedTags: string[] = [];
    if (f.flags.has(ChannelFlags.RequireTag)) {
      if (!f.availableTags.length) {
        await f.setAvailableTags([{ name: 'Docs', emoji: { id: null, name: '📚' } }]);
      }
      appliedTags = [f.availableTags[0]!.id];
    }
    thread = await f.threads.create({
      name,
      appliedTags,
      message: { embeds: [starterEmbed(kind)] },
      reason: 'Docs post auto-created',
    });
    log.bot.info({ threadId: thread.id, kind }, '[DocsForum] Post created');
    return thread;
  }

  // Existing post: make sure its first message has the right content
  const starter = await thread.fetchStarterMessage().catch(() => null);
  if (starter && starter.author.id === client.user?.id) {
    const needsUpdate = kind === 'commands' || !starter.embeds.some((e) => e.image?.url);
    if (needsUpdate) await starter.edit({ content: '', embeds: [starterEmbed(kind)] }).catch(() => null);
  }
  return thread;
}

/** Returns the docs post for the kind (creating/fixing it if needed). Never throws. */
export function getDocsPost(client: ExtendedClient, kind: DocKind): Promise<ThreadChannel | null> {
  let p = posts.get(kind);
  if (!p) {
    p = resolvePost(client, kind).catch((err: any) => {
      log.bot.error({ error: err?.message, kind }, '[DocsForum] Could not set up post (check bot permissions on the forum)');
      return null;
    });
    posts.set(kind, p);
    // Don't cache failures: retry next time
    void p.then((t) => { if (!t) posts.delete(kind); });
  }
  return p;
}

/** Refreshes the in-game commands doc. Pass the bot's identity once FNChat is logged in. */
export async function updateCommandsDoc(
  client: ExtendedClient,
  identity?: { name?: string; accountId?: string },
): Promise<void> {
  if (identity?.name) botIdentity.name = identity.name;
  if (identity?.accountId) botIdentity.accountId = identity.accountId;

  const thread = await getDocsPost(client, 'commands');
  if (!thread) return;
  const starter = await thread.fetchStarterMessage().catch(() => null);
  if (starter && starter.author.id === client.user?.id) {
    await starter.edit({ content: '', embeds: [buildCommandsEmbed()] }).catch((err: any) =>
      log.bot.warn({ error: err?.message }, '[DocsForum] Could not update commands doc'),
    );
  }
}
