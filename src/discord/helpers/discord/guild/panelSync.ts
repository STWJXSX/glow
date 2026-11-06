import {
  MessageFlags,
  type AttachmentBuilder,
  type ContainerBuilder,
  type Message,
  type TextChannel,
} from 'discord.js';
import { log } from '#helpers/core/logger.ts';

/** Bump when panel layout/copy changes (logs only — not shown in Discord). */
export const PANEL_VERSIONS = {
  support: 'glow-support-panel-v3',
  premiumInfo: 'glow-premium-info-v7',
  premiumPerks: 'glow-premium-perks-v4',
} as const;

export type PanelVersion = (typeof PANEL_VERSIONS)[keyof typeof PANEL_VERSIONS];

/** Never ping roles/everyone when creating or editing panel messages (pricing text includes role IDs). */
const SUPPRESS_MENTIONS = { parse: [] as const, roles: [] as const, users: [] as const };

const PANEL_MARKER_RE = /\n\n-#\s*glow-(support-panel|premium-info|premium-perks|self-roles)[^\n]*/gi;

type RawComponent = {
  type?: number;
  content?: string;
  components?: RawComponent[];
};

function walkComponents(components: readonly RawComponent[], parts: string[]): void {
  for (const comp of components) {
    if (typeof comp.content === 'string') parts.push(comp.content);
    if (comp.components?.length) walkComponents(comp.components, parts);
  }
}

export function collectMessageText(message: Message): string {
  const parts: string[] = [];
  if (message.content) parts.push(message.content);
  for (const embed of message.embeds) {
    if (embed.description) parts.push(embed.description);
    for (const field of embed.fields ?? []) {
      parts.push(field.name, field.value);
    }
  }
  walkComponents(message.components as RawComponent[], parts);
  return parts.join('\n');
}

function normalizePanelText(text: string): string {
  return text.replace(PANEL_MARKER_RE, '').trim();
}

function collectBuilderText(container: ContainerBuilder): string {
  const parts: string[] = [];
  walkComponents([container.toJSON() as unknown as RawComponent], parts);
  return normalizePanelText(parts.join('\n'));
}

function sortByCreated(a: Message, b: Message): number {
  return a.createdTimestamp - b.createdTimestamp;
}

/** Pick the bot messages that belong to this panel (avoid deleting unrelated bot posts). */
function selectPanelMessages(
  fetched: Iterable<Message>,
  clientUserId: string,
  expectedCount: number,
): Message[] {
  const sorted = [...fetched].filter((m) => m.author.id === clientUserId).sort(sortByCreated);
  if (sorted.length >= expectedCount) return sorted.slice(-expectedCount);
  return sorted;
}

export type PanelMessageSlot =
  | ContainerBuilder[]
  | { components: ContainerBuilder[]; files?: AttachmentBuilder[] };

function normalizePanelSlot(slot: PanelMessageSlot): {
  components: ContainerBuilder[];
  files?: AttachmentBuilder[];
} {
  if (Array.isArray(slot)) return { components: slot };
  return slot;
}

function buildV2Payload(components: ContainerBuilder[], files?: AttachmentBuilder[]) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components,
    ...(files?.length ? { files } : {}),
    allowedMentions: SUPPRESS_MENTIONS,
  } as never;
}

async function editPanelMessage(
  message: Message,
  components: ContainerBuilder[],
  files?: AttachmentBuilder[],
): Promise<void> {
  await message.edit(buildV2Payload(components, files));
}

async function sendPanelMessage(
  channel: TextChannel,
  components: ContainerBuilder[],
  files?: AttachmentBuilder[],
): Promise<void> {
  await channel.send(buildV2Payload(components, files));
}

/**
 * Sync fixed panel messages in a channel.
 * Default: edit existing messages in place (no role pings). Sends only when a slot is missing.
 * Use forceRecreate only from dev tools when the channel is corrupted.
 */
export async function syncChannelPanels(options: {
  channel: TextChannel;
  clientUserId: string;
  version: PanelVersion;
  buildMessages: () => PanelMessageSlot[];
  logTag: string;
  forceRecreate?: boolean;
}): Promise<'skipped' | 'updated' | 'created'> {
  const payloads = options.buildMessages().map(normalizePanelSlot);
  const expectedMessageCount = payloads.length;

  const fetched = await options.channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!fetched) return 'skipped';

  const panelMessages = selectPanelMessages(
    fetched.values(),
    options.clientUserId,
    expectedMessageCount,
  );

  const expectedText = payloads.flatMap((slot) => slot.components).map(collectBuilderText).join('\n');
  const currentText = normalizePanelText(panelMessages.map(collectMessageText).join('\n'));
  const upToDate = panelMessages.length === expectedMessageCount && currentText === expectedText;

  if (upToDate) {
    log.events.info(`[${options.logTag}] Panel up to date (${options.version})`);
    return 'skipped';
  }

  if (options.forceRecreate) {
    for (const msg of panelMessages) {
      await msg.delete().catch(() => {});
    }
    for (let i = 0; i < payloads.length; i++) {
      await sendPanelMessage(options.channel, payloads[i].components, payloads[i].files);
      if (i < payloads.length - 1) await new Promise((r) => setTimeout(r, 500));
    }
    const action = panelMessages.length > 0 ? 'updated' : 'created';
    log.events.info(`[${options.logTag}] Panel recreated (${options.version}, ${expectedMessageCount} msg)`);
    return action;
  }

  const edited = Math.min(panelMessages.length, expectedMessageCount);
  for (let i = 0; i < edited; i++) {
    await editPanelMessage(panelMessages[i], payloads[i].components, payloads[i].files);
    if (i < edited - 1) await new Promise((r) => setTimeout(r, 350));
  }

  for (let i = expectedMessageCount; i < panelMessages.length; i++) {
    await panelMessages[i].delete().catch(() => {});
  }

  for (let i = panelMessages.length; i < expectedMessageCount; i++) {
    await sendPanelMessage(options.channel, payloads[i].components, payloads[i].files);
    if (i < expectedMessageCount - 1) await new Promise((r) => setTimeout(r, 500));
  }

  const action = panelMessages.length > 0 ? 'updated' : 'created';
  log.events.info(
    `[${options.logTag}] Panel ${action} in place (${options.version}, ` +
      `${edited} edited, ${Math.max(0, expectedMessageCount - panelMessages.length)} sent)`,
  );
  return action;
}
