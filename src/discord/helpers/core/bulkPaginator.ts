/**
 * BULK PAGINATOR
 * Paginated bulk embeds via embedHelper — packs fields by Discord char budget.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  type Client,
  type EmbedBuilder,
} from 'discord.js';
import { createEmbed, type EmbedStyle } from './embedHelper.ts';
import { translateForUser } from '../locales/index.ts';
import { editReplyInactive } from '../commands/epic/epicCollectorHelper.ts';
import { EPIC_PAGINATION_IDLE_MS } from '../commands/epic/epicCollectorHelper.ts';
import { getEmojiButtonComponent } from './emojis.ts';

export type BulkEmbedField = { name: string; value: string; inline?: boolean };

/** Discord embed field limits */
export const BULK_FIELD_VALUE_MAX = 1024;
export const BULK_FIELD_NAME_MAX = 256;
export const BULK_MAX_FIELDS_PER_PAGE = 25;
/** Total embed char budget (title + description + fields + footer margin). */
export const BULK_EMBED_CHAR_BUDGET = 5600;

const NAV_IDS = {
  first: 'bulk_first',
  prev: 'bulk_prev',
  next: 'bulk_next',
  last: 'bulk_last',
} as const;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Split long text into field-value chunks (≤ max chars each). */
export function chunkBulkFieldValue(text: string, max = BULK_FIELD_VALUE_MAX): string[] {
  if (!text) return ['\u200b'];
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = '';
    }
    if (line.length > max) {
      let rest = line;
      while (rest.length > max) {
        chunks.push(rest.slice(0, max));
        rest = rest.slice(max);
      }
      current = rest;
    } else {
      current = line;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : ['\u200b'];
}

/** One account label → one or more fields when value exceeds 1024 chars. */
export function buildBulkFieldsFromText(
  baseName: string,
  text: string,
  inline = false,
): BulkEmbedField[] {
  const chunks = chunkBulkFieldValue(text);
  if (chunks.length === 1) {
    return [{ name: truncate(baseName, BULK_FIELD_NAME_MAX), value: chunks[0], inline }];
  }
  return chunks.map((chunk, i) => ({
    name: truncate(`${baseName} (${i + 1}/${chunks.length})`, BULK_FIELD_NAME_MAX),
    value: chunk,
    inline,
  }));
}

/**
 * Packs fields into pages using char budget + max 25 fields — not a fixed 25/page split.
 */
export function packBulkFieldsIntoPages(
  fields: BulkEmbedField[],
  overheadChars: number,
): BulkEmbedField[][] {
  const pages: BulkEmbedField[][] = [];
  let page: BulkEmbedField[] = [];
  let used = overheadChars;

  for (const field of fields) {
    const name = truncate(field.name || '\u200b', BULK_FIELD_NAME_MAX);
    const value = truncate(field.value || '\u200b', BULK_FIELD_VALUE_MAX);
    const cost = name.length + value.length + 24;

    if (
      page.length > 0 &&
      (page.length >= BULK_MAX_FIELDS_PER_PAGE || used + cost > BULK_EMBED_CHAR_BUDGET)
    ) {
      pages.push(page);
      page = [];
      used = overheadChars;
    }

    page.push({ name, value, inline: field.inline ?? true });
    used += cost;
  }

  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
}

function navButton(
  client: Client,
  customId: string,
  emojiKey: 'page_first' | 'page_prev' | 'page_next' | 'page_last',
  disabled: boolean,
): ButtonBuilder {
  const btn = new ButtonBuilder()
    .setCustomId(customId)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
  const emoji = getEmojiButtonComponent(emojiKey);
  if (emoji) btn.setEmoji(emoji);
  return btn;
}

async function buildPageFromSlice(
  interaction: ChatInputCommandInteraction,
  title: string,
  summary: string,
  pageFields: BulkEmbedField[],
  page: number,
  totalPages: number,
  style: EmbedStyle,
): Promise<{ embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const footerText = await translateForUser(
    interaction.user.id,
    'bulkMode.pagination.footer',
    {
      user: interaction.user.username,
      page: String(page + 1),
      total: String(totalPages),
    },
    interaction.locale,
  );

  const embed = await createEmbed({
    style,
    title,
    description: summary,
    fields: pageFields,
    author: null,
    footer: {
      text: footerText,
      iconURL: interaction.user.displayAvatarURL(),
    },
    interaction,
  });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    const client = interaction.client;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      navButton(client, NAV_IDS.first, 'page_first', page === 0),
      navButton(client, NAV_IDS.prev, 'page_prev', page === 0),
      navButton(client, NAV_IDS.next, 'page_next', page >= totalPages - 1),
      navButton(client, NAV_IDS.last, 'page_last', page >= totalPages - 1),
    );
    components.push(row);
  }

  return { embed, components };
}

/**
 * Sends bulk embed pages with char-budget packing and emoji nav.
 * Bulk embeds never set author (multi-account).
 */
export async function sendBulkPaginated(
  interaction: ChatInputCommandInteraction,
  title: string,
  summary: string,
  allFields: BulkEmbedField[],
  style: EmbedStyle = 'info',
): Promise<void> {
  const overhead = title.length + summary.length + 80;
  const pages = packBulkFieldsIntoPages(allFields, overhead);
  const totalPages = pages.length;
  let page = 0;

  const { embed, components } = await buildPageFromSlice(
    interaction, title, summary, pages[page], page, totalPages, style,
  );
    await interaction.editReply({ content: null, embeds: [embed], components, files: [] });

  if (totalPages <= 1) return;

  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === interaction.user.id,
    idle: EPIC_PAGINATION_IDLE_MS,
  });

  collector.on('collect', async (btn) => {
    if (btn.customId === NAV_IDS.first) page = 0;
    else if (btn.customId === NAV_IDS.prev) page = Math.max(0, page - 1);
    else if (btn.customId === NAV_IDS.next) page = Math.min(totalPages - 1, page + 1);
    else if (btn.customId === NAV_IDS.last) page = totalPages - 1;
    else {
      await btn.deferUpdate();
      return;
    }

    const updated = await buildPageFromSlice(
      interaction, title, summary, pages[page], page, totalPages, style,
    );
    await btn.update({ content: null, embeds: [updated.embed], components: updated.components, files: [] });
  });

  collector.on('end', async () => {
    try {
      const inactive = await translateForUser(
        interaction.user.id,
        'epic.inactivePagination',
        undefined,
        interaction.locale,
      );
      await editReplyInactive(interaction, inactive);
    } catch { /* message may be gone */ }
  });
}

/** Alias — pages are sized by char budget, not a fixed field count. */
export const BULK_FIELDS_PER_PAGE = BULK_MAX_FIELDS_PER_PAGE;
