/**
 * Shared Epic command embed styling — gold palette, no Epic Games logo thumbnail.
 */

import {
  type ActionRowBuilder,
  type AttachmentBuilder,
  type ButtonBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type EmbedBuilder,
  type StringSelectMenuBuilder,
} from 'discord.js';
import {
  createEmbed,
  createLoadingGifAttachment,
  getDeveloperFooter,
  LOADING_THUMBNAIL,
  type EmbedStyle,
} from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  getMainAccountAuthor,
  type AccountData,
  type AuthorData,
} from '#helpers/epic/account/avatarHandler.ts';

export interface EpicEmbedInput {
  style?: EmbedStyle;
  title?: string;
  description?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footerKey?: 'brand' | 'security' | 'sensitive' | 'none';
  footerText?: string;
  author?: AuthorData | null;
  /** Ignored — epic embeds never show embed timestamps. */
  timestamp?: boolean;
  loading?: boolean;
  image?: string;
  thumbnail?: string;
}

function hasLeadingCustomEmoji(text: string): boolean {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<:') || trimmed.startsWith('<a:')) return true;

  const firstLine = text.split('\n').find((line) => line.trim().length > 0) ?? '';
  const quoteTrimmed = firstLine.trimStart();
  if (!quoteTrimmed.startsWith('>')) return false;

  const afterQuote = quoteTrimmed.slice(1).trimStart();
  return afterQuote.startsWith('<:') || afterQuote.startsWith('<a:');
}

function applyStyleEmoji(
  client: Client | undefined,
  style: EmbedStyle,
  title?: string,
  description?: string,
): { title?: string; description?: string } {
  if (!client) return { title, description };

  if (style === 'success' && description && !hasLeadingCustomEmoji(description)) {
    description = epicEmojiLine(client, 'success', description);
  }

  if (style === 'error') {
    if (title && !hasLeadingCustomEmoji(title)) {
      title = epicEmojiLine(client, 'error', title);
    } else if (description && !hasLeadingCustomEmoji(description)) {
      description = epicEmojiLine(client, 'error', description);
    }
  }

  if (style === 'warning') {
    if (title && !hasLeadingCustomEmoji(title)) {
      title = epicEmojiLine(client, 'warning', title);
    } else if (description && !hasLeadingCustomEmoji(description)) {
      description = epicEmojiLine(client, 'warning', description);
    }
  }

  return { title, description };
}

async function resolveFooter(
  userId: string,
  input: EpicEmbedInput,
  interaction?: ChatInputCommandInteraction,
  locale?: string | null,
): Promise<{ text: string; iconURL?: string } | 'developed' | undefined> {
  if (input.footerText) return { text: input.footerText };
  if (input.footerKey === 'none') return undefined;

  if (input.footerKey === 'security' || input.footerKey === 'sensitive') {
    const key =
      input.footerKey === 'sensitive'
        ? 'account.embed.sensitiveFooter'
        : 'account.embed.securityFooter';
    const text = await translateForUser(userId, key, undefined, locale);
    return text ? { text } : undefined;
  }

  const text = await translateForUser(userId, 'account.embed.developedFooter', undefined, locale);
  return getDeveloperFooter(interaction, text);
}

export async function buildEpicEmbed(
  userId: string,
  input: EpicEmbedInput,
  interaction?: ChatInputCommandInteraction,
  locale?: string | null,
): Promise<EmbedBuilder> {
  const style = input.style ?? 'info';
  const footer = await resolveFooter(userId, input, interaction, locale);
  const styled = applyStyleEmoji(interaction?.client, style, input.title, input.description);

  return createEmbed({
    style,
    title: styled.title,
    description: styled.description,
    fields: input.fields,
    thumbnail: input.thumbnail ?? (input.loading ? LOADING_THUMBNAIL : undefined),
    image: input.image,
    timestamp: false,
    author: input.author ?? undefined,
    footer,
    interaction,
  });
}

export async function buildEpicReplyPayload(
  userId: string,
  input: EpicEmbedInput,
  interaction?: ChatInputCommandInteraction,
  locale?: string | null,
  extraFiles: AttachmentBuilder[] = [],
) {
  const embed = await buildEpicEmbed(userId, input, interaction, locale);
  const files = input.loading ? [createLoadingGifAttachment(), ...extraFiles] : extraFiles;
  return { content: null, embeds: [embed], files, components: [] };
}

async function deliverEpicReply(
  interaction: ChatInputCommandInteraction,
  payload: {
    embeds: EmbedBuilder[];
    files: AttachmentBuilder[];
    components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
  },
  ephemeral: boolean,
): Promise<void> {
  const body = {
    embeds: payload.embeds,
    files: payload.files,
    components: payload.components ?? [],
  };

  if (ephemeral) {
    if (interaction.deferred || interaction.replied) {
      await interaction.deleteReply().catch(() => {});
      await interaction.followUp({ ...body, ephemeral: true });
    } else {
      await interaction.reply({ ...body, ephemeral: true });
    }
    return;
  }

  // null clears the defer placeholder text left on the original reply.
  await interaction.editReply({ ...body, content: null });
}

export async function replyWithEpicEmbed(
  interaction: ChatInputCommandInteraction,
  userId: string,
  input: EpicEmbedInput,
  extra?: {
    files?: AttachmentBuilder[];
    components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
    /** Defaults to true when style is `error`. */
    ephemeral?: boolean;
  },
): Promise<void> {
  const payload = await buildEpicReplyPayload(
    userId,
    input,
    interaction,
    interaction.locale,
    extra?.files ?? [],
  );

  const ephemeral = extra?.ephemeral ?? input.style === 'error';

  await deliverEpicReply(
    interaction,
    { ...payload, components: extra?.components ?? [] },
    ephemeral,
  );
}

export async function getEpicAuthor(
  userId: string,
  accountData?: AccountData,
): Promise<AuthorData | null> {
  return getMainAccountAuthor(userId, accountData);
}

export async function replyEpicCredentialError(
  interaction: ChatInputCommandInteraction,
  userId: string,
  type: 'noCuenta' | 'noMain',
): Promise<void> {
  const key = type === 'noCuenta' ? 'generarEmbedError.noCuenta' : 'generarEmbedError.noMain';
  await replyWithEpicEmbed(interaction, userId, {
    style: 'error',
    description: await translateForUser(userId, key, undefined, interaction.locale),
    footerKey: 'brand',
  });
}

export async function replyEpicCustomError(
  interaction: ChatInputCommandInteraction,
  userId: string,
  descriptionKey: string,
  params?: Record<string, string>,
): Promise<void> {
  await replyWithEpicEmbed(interaction, userId, {
    style: 'error',
    description: await translateForUser(userId, descriptionKey, params, interaction.locale),
    footerKey: 'brand',
  });
}

export async function replyEpicApiError(
  interaction: ChatInputCommandInteraction,
  userId: string,
  apiError: unknown,
): Promise<void> {
  const err = apiError as {
    response?: { data?: { errorMessage?: string; errorCode?: string } };
    message?: string;
  };

  let description = await translateForUser(
    userId,
    'generarEmbedError.api.base',
    undefined,
    interaction.locale,
  );

  const detail = err?.response?.data?.errorMessage ?? err?.message;

  if (detail) {
    const label = await translateForUser(
      userId,
      'generarEmbedError.api.messageLabel',
      undefined,
      interaction.locale,
    );
    description += `\n\n**${label}**\n\`\`\`\n${detail}\n\`\`\``;
    if (err?.response?.data?.errorCode) {
      description += `\n\`${err.response.data.errorCode}\``;
    }
  }

  const title = await translateForUser(
    userId,
    'generarEmbedError.api.title',
    undefined,
    interaction.locale,
  );

  await replyWithEpicEmbed(interaction, userId, {
    style: 'error',
    title,
    description,
    footerKey: 'brand',
  });
}

/** Field section header (Discord markdown). */
export function epicSection(name: string): string {
  return `__${name}__`;
}

/** Blockquote line for panel-style bodies. */
export function epicQuote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.startsWith('>') ? line : `> ${line}`))
    .join('\n');
}

/** Prefix a line with a bot emoji (never unicode). Places emoji after blockquote when present. */
export function epicEmojiLine(
  client: Client,
  emojiKey: Parameters<typeof getEmoji>[1],
  text: string,
): string {
  const emoji = getEmoji(client, emojiKey);
  const lines = text.split('\n');
  const firstIdx = lines.findIndex((line) => line.trim().length > 0);
  if (firstIdx === -1) return `${emoji} ${text}`;

  const firstLine = lines[firstIdx];
  const trimmed = firstLine.trimStart();
  if (trimmed.startsWith('>')) {
    const indent = firstLine.slice(0, firstLine.length - trimmed.length);
    const afterQuote = trimmed.slice(1).trimStart();
    if (afterQuote.startsWith('<:') || afterQuote.startsWith('<a:')) return text;
    lines[firstIdx] = `${indent}> ${emoji} ${afterQuote}`;
    return lines.join('\n');
  }

  return `${emoji} ${text}`;
}

/** Replace `{emoji}` placeholders in translated strings with a bot emoji. */
export function injectEmoji(
  client: Client,
  text: string,
  emojiKey: Parameters<typeof getEmoji>[1] = 'info',
): string {
  if (!text.includes('{emoji}')) return text;
  return text.replace(/\{emoji\}/g, getEmoji(client, emojiKey));
}

export async function translateEpic(
  client: Client,
  userId: string,
  key: string,
  emojiKey?: Parameters<typeof getEmoji>[1],
  params?: Record<string, string>,
  locale?: string | null,
): Promise<string> {
  let raw = await translateForUser(userId, key, params, locale);
  if (raw.includes('{emoji}')) {
    raw = injectEmoji(client, raw, emojiKey ?? 'info');
  }
  return raw;
}

/** Strip unicode emojis from Discord autocomplete choice labels. */
export function stripAutocompleteLabel(text: string): string {
  return text
    .replace(/^\{emoji\}\s*/g, '')
    .replace(/\{emoji\}\s*/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Build and send an error embed ephemerally (for inline catch blocks). */
export async function replyEpicErrorEmbed(
  interaction: ChatInputCommandInteraction,
  userId: string,
  input: Omit<EpicEmbedInput, 'style'>,
  extra?: {
    files?: AttachmentBuilder[];
    components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
  },
): Promise<void> {
  await replyWithEpicEmbed(interaction, userId, { ...input, style: 'error' }, extra);
}

type EpicFollowUpInteraction = {
  followUp: ChatInputCommandInteraction['followUp'];
  client: Client;
  locale?: string | null;
};

/** Ephemeral (or custom) follow-up with epic embed styling — works on modal/component interactions. */
export async function followUpWithEpicEmbed(
  interaction: EpicFollowUpInteraction,
  userId: string,
  input: EpicEmbedInput,
  extra?: {
    components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
    ephemeral?: boolean;
    fetchReply?: boolean;
  },
) {
  const embed = await buildEpicEmbed(
    userId,
    input,
    interaction as ChatInputCommandInteraction,
    interaction.locale,
  );

  return interaction.followUp({
    embeds: [embed],
    components: extra?.components ?? [],
    ephemeral: extra?.ephemeral ?? true,
    ...(extra?.fetchReply ? { fetchReply: true } : {}),
  });
}
