/**
 * Auth command embed UI — wraps accountEmbedHelper / embedHelper (no Components V2 for switch/logout).
 */

import {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  type ActionRowBuilder,
  type ButtonBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuBuilder,
} from 'discord.js';
import { EMBED_COLORS, type EmbedStyle } from '#helpers/core/embedHelper.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  buildAccountReplyPayload,
  replyWithAccountEmbed,
  type AccountEmbedInput,
} from '../account/accountEmbedHelper.ts';

export type AuthEmbedInput = AccountEmbedInput;

export { buildAccountReplyPayload };

/** Embed + Epic thumbnail + optional components (for /logout, /switch). */
export async function buildAuthEmbedReply(
  userId: string,
  input: AuthEmbedInput,
  interaction: ChatInputCommandInteraction,
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [],
) {
  const payload = await buildAccountReplyPayload(
    userId,
    input,
    interaction,
    interaction.locale,
  );
  return { ...payload, components };
}

export async function replyWithAuthEmbed(
  interaction: ChatInputCommandInteraction,
  userId: string,
  input: AuthEmbedInput,
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [],
): Promise<void> {
  const payload = await buildAuthEmbedReply(userId, input, interaction, components);
  await interaction.editReply(payload);
}

// ─── Components V2 (login flow) ─────────────────────────────

export function authV2Reply(container: ContainerBuilder, extraComponents: unknown[] = []) {
  return {
    components: [container, ...extraComponents],
    flags: MessageFlags.IsComponentsV2,
    embeds: [],
  } as Record<string, unknown>;
}

export function authV2Container(style: EmbedStyle, content: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(EMBED_COLORS[style])
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

export function authBlock(title: string, body?: string): string {
  return body ? `## ${title}\n${body}` : `## ${title}`;
}

/** Discord blockquote (`>`) for main instructional lines. */
export function authQuoteBlock(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('> ') || trimmed.startsWith('-#') || trimmed.startsWith('##')) return line;
      return `> ${trimmed}`;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function buildDiscordMessageUrl(
  guildId: string | null | undefined,
  channelId: string,
  messageId: string,
): string {
  const guildPart = guildId ?? '@me';
  return `https://discord.com/channels/${guildPart}/${channelId}/${messageId}`;
}

export function isValidDiscordMessageUrl(url: string): boolean {
  return /^https:\/\/discord\.com\/channels\/(@me|\d{17,20})\/\d{17,20}\/\d{17,20}$/.test(url);
}

export async function authCreditLine(userId: string, locale?: string | null): Promise<string> {
  const text = await translateForUser(userId, 'account.embed.developedFooter', undefined, locale);
  return `-# ${text}`;
}

export async function appendAuthCredit(
  userId: string,
  content: string,
  interaction?: ChatInputCommandInteraction,
): Promise<string> {
  const credit = await authCreditLine(userId, interaction?.locale);
  return `${content}\n\n${credit}`;
}
