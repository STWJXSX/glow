/**
 * Shared Epic account embed styling (colors, thumbnail, footers).
 */

import path from 'path';
import {
  AttachmentBuilder,
  type ActionRowBuilder,
  type ButtonBuilder,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
} from 'discord.js';
import {
  createErrorEmbed,
  createInfoEmbed,
  createSuccessEmbed,
  createWarningEmbed,
  getDeveloperFooter,
  type EmbedStyle,
} from '#helpers/core/embedHelper.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { resolveEpicLogoPath } from '#helpers/core/glowAssetPaths.ts';
import type { AuthorData } from '#helpers/epic/account/avatarHandler.ts';

const RESOLVED_EPIC_LOGO = resolveEpicLogoPath();
export const EPIC_LOGO_FILE = RESOLVED_EPIC_LOGO ? path.basename(RESOLVED_EPIC_LOGO) : 'epicgames.png';
export const EPIC_THUMBNAIL = RESOLVED_EPIC_LOGO ? `attachment://${EPIC_LOGO_FILE}` : undefined;

export function createEpicLogoAttachment(): AttachmentBuilder | null {
  if (!RESOLVED_EPIC_LOGO) return null;
  return new AttachmentBuilder(RESOLVED_EPIC_LOGO, { name: EPIC_LOGO_FILE });
}

export interface AccountEmbedInput {
  style?: EmbedStyle;
  title?: string;
  description?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footerKey?: 'brand' | 'security' | 'sensitive' | 'none';
  footerText?: string;
  author?: AuthorData | null;
  timestamp?: boolean;
}

async function resolveSecurityFooter(
  userId: string,
  input: AccountEmbedInput,
  locale?: string | null,
): Promise<string | undefined> {
  const key =
    input.footerKey === 'sensitive'
      ? 'account.embed.sensitiveFooter'
      : 'account.embed.securityFooter';

  return translateForUser(userId, key, undefined, locale);
}

async function resolveBrandFooter(
  userId: string,
  interaction: ChatInputCommandInteraction | undefined,
  locale?: string | null,
) {
  const text = await translateForUser(userId, 'account.embed.developedFooter', undefined, locale);
  return getDeveloperFooter(interaction, text);
}

async function buildAccountEmbed(
  userId: string,
  input: AccountEmbedInput,
  interaction?: ChatInputCommandInteraction,
  locale?: string | null,
): Promise<EmbedBuilder> {
  const style = input.style ?? 'info';

  let footer: { text: string; iconURL?: string } | 'developed' | undefined;

  if (input.footerText) {
    footer = { text: input.footerText };
  } else if (input.footerKey === 'none') {
    footer = undefined;
  } else if (input.footerKey === 'security' || input.footerKey === 'sensitive') {
    const text = await resolveSecurityFooter(userId, input, locale);
    footer = text ? { text } : undefined;
  } else {
    footer = await resolveBrandFooter(userId, interaction, locale);
  }

  const opts = {
    title: input.title,
    description: input.description,
    fields: input.fields,
    thumbnail: EPIC_THUMBNAIL,
    timestamp: input.timestamp ?? false,
    author: input.author ?? undefined,
    footer,
    interaction,
  };

  switch (style) {
    case 'success':
      return createSuccessEmbed(opts);
    case 'warning':
      return createWarningEmbed(opts);
    case 'error':
      return createErrorEmbed(opts);
    default:
      return createInfoEmbed(opts);
  }
}

export async function buildAccountReplyPayload(
  userId: string,
  input: AccountEmbedInput,
  interaction?: ChatInputCommandInteraction,
  locale?: string | null,
  extraFiles: AttachmentBuilder[] = [],
) {
  const embed = await buildAccountEmbed(userId, input, interaction, locale);
  const logo = createEpicLogoAttachment();
  return { embeds: [embed], files: logo ? [logo, ...extraFiles] : extraFiles };
}

export async function replyWithAccountEmbed(
  interaction: ChatInputCommandInteraction,
  userId: string,
  input: AccountEmbedInput,
  extra?: {
    files?: AttachmentBuilder[];
    components?: ActionRowBuilder<ButtonBuilder>[];
  },
): Promise<void> {
  const payload = await buildAccountReplyPayload(
    userId,
    input,
    interaction,
    interaction.locale,
    extra?.files ?? [],
  );

  await interaction.editReply({
    ...payload,
    components: extra?.components ?? [],
  });
}

export async function replyAccountCredentialError(
  interaction: ChatInputCommandInteraction,
  userId: string,
  type: 'noCuenta' | 'noMain',
): Promise<void> {
  const key = type === 'noCuenta' ? 'generarEmbedError.noCuenta' : 'generarEmbedError.noMain';
  await replyWithAccountEmbed(interaction, userId, {
    style: 'error',
    description: await translateForUser(userId, key, undefined, interaction.locale),
    footerKey: 'brand',
  });
}

/** Field section header (Discord markdown). */
export function accountSection(name: string): string {
  return `__${name}__`;
}

/** Single labeled row for account info blocks. */
export function accountInfoRow(label: string, value: string): string {
  return `- **${label}:** ${value}`;
}

/** Labeled value in a code block (IDs, emails). */
export function accountInfoCodeRow(label: string, value: string): string {
  return `- **${label}**\n\`\`\`\n${value}\n\`\`\``;
}

/** Join section rows with blank lines between groups. */
export function accountInfoBlock(rows: string[]): string {
  return rows.filter(Boolean).join('\n\n');
}
