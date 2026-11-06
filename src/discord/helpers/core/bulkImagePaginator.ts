/**
 * BULK IMAGE PAGINATOR
 * V2 MediaGallery pages — one linked account per page (collection images, llamas, etc.).
 */

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  type Client,
} from 'discord.js';
import {
  buildComponentsV2Payload,
  createComponentsV2Container,
  type EmbedStyle,
} from './embedHelper.ts';
import { translateForUser } from '../locales/index.ts';
import {
  editReplyInactive,
  EPIC_PAGINATION_IDLE_MS,
} from '../commands/epic/epicCollectorHelper.ts';
import { getEmojiButtonComponent } from './emojis.ts';

const NAV_IDS = {
  first: 'bulk_img_first',
  prev: 'bulk_img_prev',
  next: 'bulk_img_next',
  last: 'bulk_img_last',
} as const;

export interface BulkImagePage {
  accountLabel: string;
  hint: string;
  attachments: AttachmentBuilder[];
  style?: EmbedStyle;
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

async function buildBulkImageContainer(
  interaction: ChatInputCommandInteraction,
  title: string,
  summary: string,
  page: BulkImagePage,
  pageIndex: number,
  totalPages: number,
): Promise<ContainerBuilder> {
  const userId = interaction.user.id;
  const locale = interaction.locale;

  const footerText = await translateForUser(
    userId,
    'bulkMode.pagination.footer',
    {
      user: interaction.user.username,
      page: String(pageIndex + 1),
      total: String(totalPages),
    },
    locale,
  );

  const content = `## ${title}\n\n${summary}\n\n**${page.accountLabel}**\n${page.hint}\n\n-# ${footerText}`;

  const container = createComponentsV2Container({
    style: page.style ?? 'info',
    content,
  });

  if (page.attachments.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    const gallery = new MediaGalleryBuilder();
    for (const att of page.attachments) {
      const fileName = att.name ?? 'bulk-image.webp';
      gallery.addItems(new MediaGalleryItemBuilder().setURL(`attachment://${fileName}`));
    }
    container.addMediaGalleryComponents(gallery);
  }

  return container;
}

function buildNavRow(
  client: Client,
  pageIndex: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    navButton(client, NAV_IDS.first, 'page_first', pageIndex === 0),
    navButton(client, NAV_IDS.prev, 'page_prev', pageIndex === 0),
    navButton(client, NAV_IDS.next, 'page_next', pageIndex >= totalPages - 1),
    navButton(client, NAV_IDS.last, 'page_last', pageIndex >= totalPages - 1),
  );
}

async function buildBulkImageReplyPayload(
  interaction: ChatInputCommandInteraction,
  title: string,
  summary: string,
  page: BulkImagePage,
  pageIndex: number,
  totalPages: number,
) {
  const container = await buildBulkImageContainer(interaction, title, summary, page, pageIndex, totalPages);

  if (totalPages > 1) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents(buildNavRow(interaction.client, pageIndex, totalPages));
  }

  return buildComponentsV2Payload(container, { files: page.attachments });
}

/**
 * Paginated V2 gallery bulk reply — no author (multi-account).
 */
export async function sendBulkImagePaginated(
  interaction: ChatInputCommandInteraction,
  title: string,
  summary: string,
  pages: BulkImagePage[],
  style: EmbedStyle = 'info',
): Promise<void> {
  if (!pages.length) return;

  const normalized = pages.map((p) => ({ ...p, style: p.style ?? style }));
  const totalPages = normalized.length;
  let pageIndex = 0;

  const initial = await buildBulkImageReplyPayload(
    interaction,
    title,
    summary,
    normalized[pageIndex],
    pageIndex,
    totalPages,
  );
  await interaction.editReply(initial as any);

  if (totalPages <= 1) return;

  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === interaction.user.id,
    idle: EPIC_PAGINATION_IDLE_MS,
  });

  collector.on('collect', async (btn) => {
    if (btn.customId === NAV_IDS.first) pageIndex = 0;
    else if (btn.customId === NAV_IDS.prev) pageIndex = Math.max(0, pageIndex - 1);
    else if (btn.customId === NAV_IDS.next) pageIndex = Math.min(totalPages - 1, pageIndex + 1);
    else if (btn.customId === NAV_IDS.last) pageIndex = totalPages - 1;
    else {
      await btn.deferUpdate();
      return;
    }

    const updated = await buildBulkImageReplyPayload(
      interaction,
      title,
      summary,
      normalized[pageIndex],
      pageIndex,
      totalPages,
    );
    await btn.update(updated as any);
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
