/**
 * Uniform UI when a component collector ends due to `idle` (inactivity):
 * keep the current message, append a ## heading, success accent/color, disable controls.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  EmbedBuilder,
  Message,
  MessageFlags,
  StringSelectMenuBuilder,
  type InteractionEditReplyOptions,
} from 'discord.js';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';

const CONTAINER_COMPONENT_TYPE = 17;
const TEXT_DISPLAY_COMPONENT_TYPE = 10;

/** Strip `-#` small text prefix; append as Discord ## heading block. */
export function formatInactiveNotice(translated: string): string {
  let t = translated.trim();
  if (t.startsWith('-# ')) t = t.slice(3).trim();
  if (t.startsWith('##')) return `\n\n${t}`;
  return `\n\n## ${t}`;
}

export function disableMessageActionRows(
  components: Message['components'],
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  if (!components?.length) return [];
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  for (const row of components) {
    if (row.type !== ComponentType.ActionRow) continue;
    const builder = new ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>();
    for (const component of row.components) {
      if (component.type === ComponentType.Button) {
        builder.addComponents(ButtonBuilder.from(component).setDisabled(true));
      } else if (component.type === ComponentType.StringSelect) {
        builder.addComponents(StringSelectMenuBuilder.from(component).setDisabled(true));
      }
    }
    rows.push(builder);
  }
  return rows;
}

function walkDisableComponent(component: Record<string, unknown>): void {
  const type = component.type as number;
  if (type === ComponentType.Button || type === ComponentType.StringSelect) {
    component.disabled = true;
  }
  const children = component.components;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object') walkDisableComponent(child as Record<string, unknown>);
    }
  }
}

function applyInactiveToEmbed(embed: EmbedBuilder, notice: string): EmbedBuilder {
  embed.setColor(EMBED_COLORS.success);
  const base = embed.data.description ?? '';
  const merged = (base + notice).trim();
  embed.setDescription(merged || notice.trim());
  return embed;
}

function isComponentsV2Message(message: Message): boolean {
  return message.flags.has(MessageFlags.IsComponentsV2);
}

function disableAndAppendV2Components(components: readonly unknown[], notice: string): unknown[] {
  const cloned = JSON.parse(JSON.stringify(components)) as Record<string, unknown>[];
  for (const c of cloned) walkDisableComponent(c);

  for (const c of cloned) {
    if (c.type === CONTAINER_COMPONENT_TYPE) {
      c.accent_color = EMBED_COLORS.success;
    }
  }

  const noticeContent = notice.trim();
  const lastContainer = [...cloned].reverse().find((c) => c.type === CONTAINER_COMPONENT_TYPE);
  if (lastContainer) {
    const list = lastContainer.components;
    if (!Array.isArray(list)) lastContainer.components = [];
    (lastContainer.components as unknown[]).push({
      type: TEXT_DISPLAY_COMPONENT_TYPE,
      content: noticeContent,
    });
  }

  return cloned;
}

export async function editMessageInactive(message: Message, inactiveTranslated: string): Promise<void> {
  const notice = formatInactiveNotice(inactiveTranslated);

  if (isComponentsV2Message(message)) {
    await message
      .edit({
        components: disableAndAppendV2Components(message.components as unknown[], notice),
        flags: MessageFlags.IsComponentsV2,
      } as Parameters<Message['edit']>[0])
      .catch(() => undefined);
    return;
  }

  const embeds =
    message.embeds.length > 0
      ? message.embeds.map((e) => applyInactiveToEmbed(EmbedBuilder.from(e), notice))
      : [];

  await message
    .edit({
      embeds: embeds.length ? embeds : undefined,
      content: message.content ? `${message.content}${notice}` : undefined,
      components: disableMessageActionRows(message.components),
    })
    .catch(() => undefined);
}

export async function editReplyInactive(
  interaction: {
    fetchReply: () => Promise<Message>;
    editReply: (options: InteractionEditReplyOptions) => Promise<Message>;
  },
  inactiveTranslated: string,
  options?: { clearFiles?: boolean },
): Promise<void> {
  const notice = formatInactiveNotice(inactiveTranslated);
  const reply = await interaction.fetchReply().catch(() => null);
  if (!reply) return;

  if (isComponentsV2Message(reply)) {
    await interaction
      .editReply({
        embeds: [],
        content: null,
        files: options?.clearFiles ? [] : undefined,
        components: disableAndAppendV2Components(reply.components as unknown[], notice) as InteractionEditReplyOptions['components'],
        flags: MessageFlags.IsComponentsV2,
      })
      .catch(() => undefined);
    return;
  }

  const embeds =
    reply.embeds.length > 0
      ? reply.embeds.map((e) => applyInactiveToEmbed(EmbedBuilder.from(e), notice))
      : [applyInactiveToEmbed(new EmbedBuilder(), notice)];

  await interaction
    .editReply({
      embeds,
      content: reply.content || undefined,
      files: options?.clearFiles ? [] : undefined,
      components: disableMessageActionRows(reply.components),
    })
    .catch(() => undefined);
}
