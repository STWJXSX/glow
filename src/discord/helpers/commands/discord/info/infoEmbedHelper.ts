/**
 * Shared Epic info-command embed styling (reuses account palette + footers).
 */

import {
  type ActionRowBuilder,
  type AttachmentBuilder,
  type ButtonBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  buildAccountReplyPayload,
  replyWithAccountEmbed,
  type AccountEmbedInput,
} from '#helpers/commands/epic/account/accountEmbedHelper.ts';

export type InfoEmbedInput = AccountEmbedInput;

export async function buildInfoReplyPayload(
  userId: string,
  input: InfoEmbedInput,
  interaction?: ChatInputCommandInteraction,
  locale?: string | null,
  extraFiles: AttachmentBuilder[] = [],
) {
  return buildAccountReplyPayload(userId, input, interaction, locale, extraFiles);
}

export async function replyWithInfoEmbed(
  interaction: ChatInputCommandInteraction,
  userId: string,
  input: InfoEmbedInput,
  extra?: {
    files?: AttachmentBuilder[];
    components?: ActionRowBuilder<ButtonBuilder>[];
  },
): Promise<void> {
  return replyWithAccountEmbed(interaction, userId, input, extra);
}
