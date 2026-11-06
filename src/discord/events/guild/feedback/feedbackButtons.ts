/**
 * EVENTO feedbackButtons
 * Persistent handler (looks the feedback up in the DB by messageId) for:
 *  - feedback_accept / feedback_reject buttons (pending → accepted / rejected)
 *  - feedback_status select (accepted/investigating/found → next status)
 *      bugs:        Investigating → Found → Resolved
 *      suggestions: Implemented
 * Only DEVELOPER_IDS may act. On every change:
 *  - the message is rebuilt (color + label, select kept while still open)
 *  - the forum post tags are swapped, a note is posted, and the post is
 *    locked/archived when rejected or resolved
 *  - the Trello card moves to the matching list
 *  - the author gets a DM
 */

import {
  Events,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import Feedback, { type FeedbackStatus, type FeedbackType } from '#models/Feedback.ts';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { applyFeedbackStatus } from '#helpers/discord/feedback/feedbackForum.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { moveFeedbackCard } from '#helpers/discord/feedback/trello.ts';

const DEVELOPER_IDS = (process.env.DEVELOPER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);

const STATUS_VIEW: Record<Exclude<FeedbackStatus, 'pending'>, { color: number; emoji: string }> = {
  accepted: { color: 0x2ECC71, emoji: '✅' },
  investigating: { color: 0xE67E22, emoji: '🔍' },
  found: { color: 0x3498DB, emoji: '🎯' },
  resolved: { color: 0x1F8B4C, emoji: '🛠️' },
  rejected: { color: 0xED4245, emoji: '❌' },
};

function statusLabel(type: FeedbackType, status: FeedbackStatus): string {
  if (status === 'resolved') return type === 'suggestion' ? 'Implemented' : 'Resolved';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Statuses a dev can still move to from the select menu. */
function nextStatuses(type: FeedbackType, current: FeedbackStatus): FeedbackStatus[] {
  const all: FeedbackStatus[] = type === 'bugreport' ? ['investigating', 'found', 'resolved'] : ['resolved'];
  return all.filter((s) => s !== current);
}

function buildStatusSelect(type: FeedbackType, current: FeedbackStatus) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('feedback_status')
      .setPlaceholder('Update status')
      .addOptions(
        nextStatuses(type, current).map((s) => ({
          label: statusLabel(type, s),
          value: s,
          emoji: STATUS_VIEW[s as Exclude<FeedbackStatus, 'pending'>].emoji,
        })),
      ),
  );
}

/** Locale key (under feedbackDm) for the DM matching type + status. */
function dmKey(type: FeedbackType, status: FeedbackStatus): string | null {
  const prefix = type === 'bugreport' ? 'bug' : 'suggestion';
  if (status === 'resolved') return type === 'bugreport' ? 'bugResolved' : 'suggestionImplemented';
  if (status === 'pending') return null;
  return `${prefix}${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

const event: BotEvent<'interactionCreate'> = {
  name: Events.InteractionCreate,
  once: false,

  async execute(client: ExtendedClient, interaction) {
    let inter: ButtonInteraction | StringSelectMenuInteraction;
    let newStatus: FeedbackStatus;
    let allowedFrom: FeedbackStatus[];

    if (interaction.isButton() && (interaction.customId === 'feedback_accept' || interaction.customId === 'feedback_reject')) {
      inter = interaction;
      newStatus = interaction.customId === 'feedback_accept' ? 'accepted' : 'rejected';
      allowedFrom = ['pending'];
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'feedback_status') {
      inter = interaction;
      newStatus = interaction.values[0] as FeedbackStatus;
      allowedFrom = ['accepted', 'investigating', 'found'];
    } else {
      return;
    }

    // Solo developers
    if (!DEVELOPER_IDS.includes(inter.user.id)) {
      await inter.deferUpdate();
      return;
    }
    await inter.deferUpdate();

    const messageId = inter.message.id;
    const feedback = await Feedback.findOne({ messageId, status: { $in: allowedFrom } });
    if (!feedback) return;
    if (!(newStatus in STATUS_VIEW) || (inter.isStringSelectMenu() && !nextStatuses(feedback.type, feedback.status).includes(newStatus))) return;

    feedback.status = newStatus;
    await feedback.save();

    const view = STATUS_VIEW[newStatus as Exclude<FeedbackStatus, 'pending'>];
    const typeLabel = feedback.type === 'suggestion' ? 'Suggestion' : 'Bug Report';
    const botAvatar = client.user?.displayAvatarURL({ size: 128 }) ?? '';

    const container = new ContainerBuilder().setAccentColor(view.color);

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${typeLabel} — ${view.emoji} ${statusLabel(feedback.type, newStatus)}\n-# <@${feedback.userId}> (${feedback.userId})`,
          ),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar)),
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Original\n**${feedback.title}**\n${feedback.description}`),
    );
    const hasTranslation = feedback.titleEn &&
      (feedback.titleEn.trim() !== feedback.title.trim() || (feedback.descriptionEn ?? '').trim() !== feedback.description.trim());
    if (hasTranslation) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### English\n**${feedback.titleEn}**\n${feedback.descriptionEn}`),
      );
    }

    if (feedback.imageUrl) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Image'))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(feedback.imageUrl)),
      );
    }

    // Keep the status select while the item is still open
    if (['accepted', 'investigating', 'found'].includes(newStatus)) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addActionRowComponents(buildStatusSelect(feedback.type, newStatus));
    }

    try {
      await inter.message.edit({
        components: [container.toJSON() as any],
        flags: MessageFlags.IsComponentsV2,
      } as any);
    } catch (err) {
      log.events.error({ err, messageId }, '[feedbackButtons] Error editing message');
    }

    // DM the user
    try {
      const user = await client.users.fetch(feedback.userId);
      const msgUrl = `https://discord.com/channels/${inter.guildId ?? '@me'}/${feedback.channelId}/${feedback.messageId}`;
      const key = dmKey(feedback.type, newStatus);
      if (key) {
        const text = await translateForUser(feedback.userId, `feedbackDm.${key}`, { title: feedback.title });
        const linkLabel = await translateForUser(feedback.userId, 'feedbackDm.postLink');
        const lines = [text, `${linkLabel}: ${msgUrl}`];
        if (feedback.trelloCardUrl) {
          lines.push(`${await translateForUser(feedback.userId, 'feedbackDm.trelloLink')}: ${feedback.trelloCardUrl}`);
        }
        await user.send(lines.join('\n'));
      }
    } catch (err) {
      log.events.warn({ err, userId: feedback.userId }, '[feedbackButtons] Could not DM user');
    }

    // Trello card + forum tags (archives/locks the post when rejected/resolved, so keep last)
    if (feedback.trelloCardId) await moveFeedbackCard(feedback.trelloCardId, newStatus);
    await applyFeedbackStatus(
      client,
      feedback.channelId,
      feedback.type,
      newStatus,
      `${view.emoji} **${statusLabel(feedback.type, newStatus)}** — by <@${inter.user.id}>`,
    );

    log.events.info(
      { messageId, userId: feedback.userId, type: feedback.type, status: newStatus },
      `[feedbackButtons] Feedback ${newStatus}`,
    );
  },
};

export default event;
