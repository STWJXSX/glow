/**
 * EMBED HELPER
 * Sistema centralizado para crear embeds con estilos consistentes
 * 
 * ESTILOS DISPONIBLES:
 * - info: #ffc87c (Dorado)
 * - success: #ffc87c (Dorado)
 * - error: #cf0d10 (Rojo)
 * - warning: #FFFF00 (Amarillo) #8B6A00
 */

import {
  EmbedBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import path from 'path';
import { existsSync } from 'fs';
import { getMainAccountAuthor, type AuthorData } from '../epic/account/avatarHandler.ts';
import { getEmoji } from './emojis.ts';

export const LOADING_GIF_FILE = 'loading.gif';
export const LOADING_THUMBNAIL = `attachment://${LOADING_GIF_FILE}`;

function resolveLoadingGifPath(): string {
  const rel = path.join('assets', LOADING_GIF_FILE);
  const candidates = [
    path.join(process.cwd(), rel),
    path.join(process.cwd(), '..', rel),
    path.join((import.meta.dirname ?? __dirname), '..', '..', '..', rel),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

export function createLoadingGifAttachment(): AttachmentBuilder {
  return new AttachmentBuilder(resolveLoadingGifPath(), { name: LOADING_GIF_FILE });
}

export const EMBED_COLORS = {
  info: 0xffc87c,
  success: 0xffc87c,
  error: 0xA0001C,
  warning: 0xC68A00,
} as const;

export type EmbedStyle = keyof typeof EMBED_COLORS;

export const DEVELOPER_USER_ID = '807586817581908008';
export const DEFAULT_DEVELOPED_FOOTER = 'Developed by mrjxsx 💖';

/** Footer with developer avatar (used by account embeds and `footer: 'developed'`). */
export async function getDeveloperFooter(
  interaction?: ChatInputCommandInteraction | ButtonInteraction,
  text: string = DEFAULT_DEVELOPED_FOOTER,
): Promise<{ text: string; iconURL: string }> {
  let avatarURL = `https://cdn.discordapp.com/avatars/${DEVELOPER_USER_ID}/default.png`;

  try {
    if (interaction) {
      const owner = await interaction.client.users.fetch(DEVELOPER_USER_ID);
      avatarURL = owner.displayAvatarURL();
    }
  } catch {
    // fallback URL above
  }

  return { text, iconURL: avatarURL };
}

export interface EmbedOptions {
  style: EmbedStyle;
  title?: string;
  description?: string;
  thumbnail?: string;
  image?: string;
  timestamp?: boolean;
  footer?: {
    text: string;
    iconURL?: string;
  } | 'developed' | 'user';
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  author?: AuthorData | 'main-account' | null;
  interaction?: ChatInputCommandInteraction | ButtonInteraction;
}

/**
 * Crea un embed con el estilo especificado
 */
export async function createEmbed(options: EmbedOptions): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder().setColor(EMBED_COLORS[options.style]);
  
  // Título
  if (options.title) {
    embed.setTitle(options.title);
  }
  
  // Descripción
  if (options.description) {
    embed.setDescription(options.description);
  }
  
  // Thumbnail
  if (options.thumbnail) {
    embed.setThumbnail(options.thumbnail);
  }
  
  // Imagen
  if (options.image) {
    embed.setImage(options.image);
  }
  
  // Timestamp
  if (options.timestamp) {
    embed.setTimestamp();
  }
  
  // Fields
  if (options.fields && options.fields.length > 0) {
    embed.addFields(options.fields);
  }
  
  // Author (Avatar de la cuenta principal)
  if (options.author === 'main-account' && options.interaction) {
    const authorData = await getMainAccountAuthor(options.interaction.user.id);
    if (authorData) {
      embed.setAuthor(authorData);
    }
  } else if (options.author && typeof options.author === 'object') {
    embed.setAuthor(options.author);
  }
  
  // Footer
  if (options.footer) {
    if (options.footer === 'developed') {
      const { text, iconURL } = await getDeveloperFooter(options.interaction);
      embed.setFooter({ text, iconURL });
    } else if (options.footer === 'user' && options.interaction) {
      // Footer con el usuario que ejecutó el comando
      embed.setFooter({
        text: options.interaction.user.username,
        iconURL: options.interaction.user.displayAvatarURL(),
      });
    } else if (typeof options.footer === 'object') {
      // Footer personalizado
      embed.setFooter(options.footer);
    }
  }
  
  return embed;
}

/**
 * Crea un embed de información
 */
export async function createInfoEmbed(options: Omit<EmbedOptions, 'style'>): Promise<EmbedBuilder> {
  return createEmbed({ ...options, style: 'info' });
}

/**
 * Crea un embed de éxito
 */
export async function createSuccessEmbed(options: Omit<EmbedOptions, 'style'>): Promise<EmbedBuilder> {
  return createEmbed({ ...options, style: 'success' });
}

/**
 * Crea un embed de error
 */
export async function createErrorEmbed(options: Omit<EmbedOptions, 'style'>): Promise<EmbedBuilder> {
  return createEmbed({ ...options, style: 'error' });
}

/**
 * Crea un embed de advertencia
 */
export async function createWarningEmbed(options: Omit<EmbedOptions, 'style'>): Promise<EmbedBuilder> {
  return createEmbed({ ...options, style: 'warning' });
}

/** Sync embed when only style + description (or title) are needed. */
export function createDescriptionEmbed(
  style: EmbedStyle,
  description: string,
  extra?: { title?: string; timestamp?: boolean },
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(EMBED_COLORS[style]).setDescription(description);
  if (extra?.title) embed.setTitle(extra.title);
  if (extra?.timestamp) embed.setTimestamp();
  return embed;
}

/** Discord caps total embed text per message (all embeds combined). */
export const DISCORD_MESSAGE_EMBEDS_CHAR_LIMIT = 6000;
export const DISCORD_MAX_EMBEDS_PER_MESSAGE = 10;
/** Safe per-embed description budget before title/fields/footer. */
export const DISCORD_EMBED_DESCRIPTION_SAFE = 3800;

export function truncateEmbedText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function measureEmbedCharSize(embed: EmbedBuilder): number {
  const data = embed.toJSON();
  let size = 0;
  if (data.title) size += data.title.length;
  if (data.description) size += data.description.length;
  if (data.footer?.text) size += data.footer.text.length;
  if (data.author?.name) size += data.author.name.length;
  if (data.fields) {
    for (const field of data.fields) {
      size += (field.name?.length ?? 0) + (field.value?.length ?? 0);
    }
  }
  return size;
}

/** Split embeds into DM-safe batches (≤10 embeds, ≤6000 chars total each). */
export function packEmbedsForMessages(
  embeds: EmbedBuilder[],
  charLimit = DISCORD_MESSAGE_EMBEDS_CHAR_LIMIT,
  maxPerMessage = DISCORD_MAX_EMBEDS_PER_MESSAGE,
): EmbedBuilder[][] {
  const batches: EmbedBuilder[][] = [];
  let current: EmbedBuilder[] = [];
  let currentSize = 0;

  for (const embed of embeds) {
    const size = measureEmbedCharSize(embed);
    const exceedsChars = current.length > 0 && currentSize + size > charLimit;
    const exceedsCount = current.length >= maxPerMessage;

    if (exceedsChars || exceedsCount) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }

    if (size > charLimit && current.length === 0) {
      batches.push([embed]);
      continue;
    }

    current.push(embed);
    currentSize += size;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

export interface TextSendableChannel {
  send(content: { embeds: EmbedBuilder[] }): Promise<unknown>;
}

/** Send embed batches; falls back to one embed per message on API errors. */
export async function sendEmbedBatches(
  channel: TextSendableChannel,
  embeds: EmbedBuilder[],
  onError?: (error: unknown, context: string) => void,
): Promise<void> {
  const batches = packEmbedsForMessages(embeds);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    try {
      await channel.send({ embeds: batch });
    } catch (error) {
      onError?.(error, `batch ${i + 1}/${batches.length}`);
      for (const embed of batch) {
        try {
          await channel.send({ embeds: [embed] });
        } catch (inner) {
          onError?.(inner, 'single embed fallback');
        }
      }
    }
  }
}

/**
 * Crea un embed de error genérico con detalles técnicos
 * @param error Mensaje de error o objeto Error
 * @param interaction Interacción del comando
 * @param title Título del embed (opcional)
 */
/** Maps semantic tones (e.g. checker panel) to embedHelper styles */
export function embedStyleFromTone(
  tone: 'neutral' | 'success' | 'warning' | 'error',
): EmbedStyle {
  switch (tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'info';
  }
}

/** Latency → style (defaults match /bot ping thresholds). */
export function embedStyleFromLatency(
  ms: number,
  thresholds: { excellent?: number; good?: number } = {},
): EmbedStyle {
  const excellent = thresholds.excellent ?? 500;
  const good = thresholds.good ?? 1200;
  if (ms < excellent) return 'success';
  if (ms < good) return 'warning';
  return 'error';
}

/** Empty V2 container with palette accent color. */
export function createV2Container(style: EmbedStyle): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(EMBED_COLORS[style]);
}

// ─── Components V2 ───────────────────────────────────────────────────────────

export interface ComponentsV2ContainerOptions {
  style: EmbedStyle;
  /** Main markdown body (supports ## headings) */
  content: string;
  /** Optional small footer line (rendered as -# text) */
  footer?: string;
  author?: AuthorData | null;
}

export interface ComponentsV2ReplyOptions {
  files?: AttachmentBuilder[];
}

/**
 * Container with accent color from embedHelper palette + text display(s).
 */
export function createComponentsV2Container(
  options: ComponentsV2ContainerOptions,
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(EMBED_COLORS[options.style]);
  const body = options.footer
    ? `${options.content}\n\n-# ${options.footer}`
    : options.content;

  if (options.author) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(options.author.iconURL)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  }

  return container;
}

export function buildComponentsV2Payload(
  container: ContainerBuilder,
  options?: ComponentsV2ReplyOptions,
): {
  embeds: [];
  content: undefined;
  components: ReturnType<ContainerBuilder['toJSON']>[];
  files: AttachmentBuilder[];
  flags: typeof MessageFlags.IsComponentsV2;
} {
  return {
    embeds: [],
    content: undefined,
    components: [container.toJSON() as ReturnType<ContainerBuilder['toJSON']>],
    files: options?.files ?? [],
    flags: MessageFlags.IsComponentsV2,
  };
}

/** Classic embed + action rows (selects/buttons). Omit `flags` so Discord keeps the message type unchanged. */
export function buildClassicEmbedEditPayload(options: {
  embeds: EmbedBuilder[];
  files?: AttachmentBuilder[];
  components?: LockerV2ActionRow[];
  content?: string | null;
}): {
  content: string | null;
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
  components: LockerV2ActionRow[];
} {
  return {
    content: options.content ?? null,
    embeds: options.embeds,
    files: options.files ?? [],
    components: options.components ?? [],
  };
}

export async function replyComponentsV2(
  interaction: ChatInputCommandInteraction,
  container: ContainerBuilder,
  options?: ComponentsV2ReplyOptions,
): Promise<void> {
  await interaction.editReply(buildComponentsV2Payload(container, options) as any);
}

export type LockerV2ActionRow =
  | ActionRowBuilder<StringSelectMenuBuilder>
  | ActionRowBuilder<ButtonBuilder>;

/**
 * Locker UI: filter text + select menus / buttons inside a V2 container.
 */
export function createLockerComponentsV2Container(
  style: EmbedStyle,
  filterContent: string,
  rows: LockerV2ActionRow[],
  author?: AuthorData | null,
): ContainerBuilder {
  const container = createComponentsV2Container({
    style,
    content: filterContent,
    author: author ?? null,
  });

  if (rows.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );
    for (const row of rows) {
      container.addActionRowComponents(row as never);
    }
  }

  return container;
}

export async function createGenericErrorEmbed(
  error: string | Error | any,
  interaction: ChatInputCommandInteraction,
  title?: string
): Promise<EmbedBuilder> {
  let errorMessage: string;
  let errorCode: string | undefined;
  
  // Procesar el error
  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorCode = (error as any).code || (error as any).status;
  } else if (error.response?.data?.errorMessage) {
    // Error de API de Epic
    errorMessage = error.response.data.errorMessage;
    errorCode = error.response.data.errorCode || error.response.status;
  } else if (error.message) {
    errorMessage = error.message;
    errorCode = error.code || error.status;
  } else {
    errorMessage = 'An unexpected error occurred';
  }
  
  // Construir descripción con código en bloque si hay detalles
  let description = errorMessage;
  
  if (errorCode) {
    description = `\`\`\`\nError: ${errorMessage}\nCode: ${errorCode}\n\`\`\``;
  } else if (errorMessage.length > 100) {
    description = `\`\`\`\n${errorMessage}\n\`\`\``;
  }
  
  // Obtener autor (cuenta principal)
  const authorData = await getMainAccountAuthor(interaction.user.id);
  
  return createErrorEmbed({
    title: title || `${getEmoji(interaction.client, 'error')} Error`,
    description,
    footer: 'user',
    timestamp: true,
    author: authorData,
    interaction,
  });
}
