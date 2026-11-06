/**
 * Giveaway Handler
 * — Handles 🎉 button clicks (join/leave giveaway)
 * — Handles 🔄 reroll button (host-only)
 * — Schedules auto-finish timers (also used on startup for recovery)
 * — Builds the giveaway embed
 */

import {
  Events,
  ButtonInteraction,
  EmbedBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  TextChannel,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { translate } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { log } from '#helpers/core/logger.ts';
import Giveaway, { type IGiveaway } from '#models/Giveaway.ts';

// ─── Container Builder (ComponentsV2) ───────────────────────────────────────

interface ContainerOptions {
  prize: string;
  description: string | null;
  imageUrl: string | null;
  endsAt: Date;
  participantCount: number;
  botAvatar: string;
  lang: SupportedLanguage;
  ended: boolean;
  winnerId?: string | null;
  createdAt: Date;
  embedColor?: number | null;
  buttonStyle?: number | null;
  buttonLabel?: string | null;
  buttonEmoji?: string | null;
}

export function buildGiveawayContainer(opts: ContainerOptions): ContainerBuilder {
  const {
    prize, description, imageUrl, createdAt, endsAt,
    participantCount, botAvatar, lang, ended, winnerId,
    embedColor, buttonStyle, buttonLabel, buttonEmoji
  } = opts;

  const accentColor = ended ? 0x95A5A6 : (embedColor ?? 0xFFD700);
  const title = ended
    ? '🎉 Giveaway Ended'
    : '🎉 Giveaway';

  const startTimestamp = Math.floor(createdAt.getTime() / 1000);
  const timestamp = Math.floor(endsAt.getTime() / 1000);

  const container = new ContainerBuilder().setAccentColor(accentColor);

  // Header with bot thumbnail
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${title}`)
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar))
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  // Prize / message text (no heading, just the content directly)
  let prizeText = prize;
  if (description) prizeText += `\n${description}`;
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(prizeText)
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  if (ended) {
    // End time + participants
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Started**: <t:${startTimestamp}:f>\n` +
        `**Ended**: <t:${timestamp}:f>\n` +
        `**Participants**: ${participantCount}`
      )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    // Winner
    if (winnerId) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Winner**: <@${winnerId}>`
        )
      );
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**No participants.**`
        )
      );
    }

    // Reroll button (host-only enforced in handler)
    if (participantCount > 0) {
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('giveaway_reroll')
            .setLabel(`Reroll`)
            .setStyle(ButtonStyle.Secondary)
        )
      );
    }
  } else {
    // End time + participants
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Started**: <t:${startTimestamp}:R> (<t:${startTimestamp}:f>)\n` +
        `**Ends**: <t:${timestamp}:R> (<t:${timestamp}:f>)\n` +
        `**Participants**: ${participantCount}`
      )
    );

    // Participate button
    const btnEmoji = buttonEmoji ?? '';
    const btnLabel = buttonLabel ?? 'Join';
    const btnStyle = buttonStyle ?? ButtonStyle.Success;

    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('giveaway_join')
          .setLabel(btnEmoji ? `${btnEmoji} ${btnLabel}` : btnLabel)
          .setStyle(btnStyle)
      )
    );
  }

  // Image
  if (imageUrl) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl)
      )
    );
  }

  return container;
}

// ─── Finish Giveaway ─────────────────────────────────────────────────────────

async function finishGiveaway(client: ExtendedClient, giveaway: IGiveaway): Promise<void> {
  try {
    // Remove from active timers
    client.activeGiveaways?.delete(giveaway.messageId);

    // Reload from DB to get latest participants
    const fresh = await Giveaway.findOne({ messageId: giveaway.messageId });
    if (!fresh || fresh.ended) return;

    fresh.ended = true;

    // Pick winner (weighted random by entries)
    let winnerId: string | null = null;
    if (fresh.participants.size > 0) {
      winnerId = pickWeightedWinner(fresh);
      fresh.winnerId = winnerId;
    }

    await fresh.save();

    // Update the message
    const channel = client.channels.cache.get(fresh.channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;

    const botAvatar = client.user?.displayAvatarURL({ size: 256 }) ?? '';

    const container = buildGiveawayContainer({
      prize: fresh.prize,
      description: fresh.description,
      imageUrl: fresh.imageUrl,
      createdAt: fresh.createdAt,
      endsAt: fresh.endsAt,
      participantCount: fresh.participants.size,
      botAvatar,
      lang: 'en',
      ended: true,
      winnerId,
      embedColor: fresh.embedColor,
      buttonStyle: fresh.buttonStyle,
      buttonLabel: fresh.buttonLabel,
      buttonEmoji: fresh.buttonEmoji,
    });

    try {
      const msg = await channel.messages.fetch(fresh.messageId);
      await msg.edit({
        components: [container.toJSON() as any],
        flags: MessageFlags.IsComponentsV2,
      } as any);
    } catch (err) {
      log.events.error({ err, messageId: fresh.messageId }, '[giveaway] Error editing ended message');
    }

    // Send congratulations message
    if (winnerId) {
      await channel.send(
        `🎉 Congratulations <@${winnerId}>! You just won: **${fresh.prize}**!`
      );
    }
  } catch (err) {
    log.events.error({ err, messageId: giveaway.messageId }, '[giveaway] Error finishing giveaway');
  }
}

/** Weighted random pick from participants map. */
export function pickWeightedWinner(giveaway: IGiveaway): string | null {
  const pool: string[] = [];
  giveaway.participants.forEach((data, uId) => {
    for (let i = 0; i < data.entries; i++) pool.push(uId);
  });
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}


// ─── Schedule Timer ──────────────────────────────────────────────────────────

export function scheduleGiveawayEnd(client: ExtendedClient, giveaway: IGiveaway): void {
  if (!client.activeGiveaways) client.activeGiveaways = new Map();

  // Clear existing timer if any
  const existing = client.activeGiveaways.get(giveaway.messageId);
  if (existing) clearTimeout(existing);

  const delay = giveaway.endsAt.getTime() - Date.now();

  if (delay <= 0) {
    // Already expired — finish immediately
    finishGiveaway(client, giveaway);
    return;
  }

  // Cap setTimeout to ~24 days (max safe int). Re-schedule if longer.
  const MAX_TIMEOUT = 2_147_483_647;
  const timer = setTimeout(() => {
    if (delay > MAX_TIMEOUT) {
      // Re-schedule with remaining time
      scheduleGiveawayEnd(client, giveaway);
    } else {
      finishGiveaway(client, giveaway);
    }
  }, Math.min(delay, MAX_TIMEOUT));

  client.activeGiveaways.set(giveaway.messageId, timer);
}

// ─── Startup Recovery ────────────────────────────────────────────────────────

export async function initGiveaways(client: ExtendedClient): Promise<void> {
  const activeGiveaways = await Giveaway.find({ ended: false });
  if (activeGiveaways.length === 0) return;

  for (const giveaway of activeGiveaways) {
    scheduleGiveawayEnd(client, giveaway);
  }

  log.events.info({ count: activeGiveaways.length }, '[giveaway] Recovered active giveaways');
}

// ─── Button Event Handler ────────────────────────────────────────────────────

const event: BotEvent<'interactionCreate'> = {
  name: Events.InteractionCreate,
  once: false,

  async execute(client: ExtendedClient, interaction) {
    if (!interaction.isButton()) return;
    const btn = interaction as ButtonInteraction;

    if (btn.customId === 'giveaway_join') {
      await handleJoin(client, btn);
    } else if (btn.customId === 'giveaway_reroll') {
      await handleReroll(client, btn);
    }
  },
};

// ─── Join / Leave Handler ────────────────────────────────────────────────────

async function handleJoin(client: ExtendedClient, btn: ButtonInteraction): Promise<void> {
  await btn.deferReply({ flags: MessageFlags.Ephemeral });

  const messageId = btn.message.id;
  const giveaway = await Giveaway.findOne({ messageId });
  if (!giveaway) return;

  if (giveaway.ended) {
    await btn.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setDescription(`❌ This giveaway has ended.`),
      ],
    });
    return;
  }

  const userId = btn.user.id;

  // Toggle participation
  if (giveaway.participants.has(userId)) {
    // Leave
    giveaway.participants.delete(userId);
    await giveaway.save();

    await updateGiveawayMessage(client, giveaway);

    await btn.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95A5A6)
          .setTitle('Left Giveaway')
          .setDescription(`You have successfully left the giveaway for **${giveaway.prize}**.\n\nClick the button again to rejoin.`),
      ],
    });
  } else {
    // Join
    giveaway.participants.set(userId, { entries: 1, joinedAt: new Date() });
    await giveaway.save();

    await updateGiveawayMessage(client, giveaway);

    await btn.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('Joined Giveaway!')
          .setDescription(`You are now participating for **${giveaway.prize}**.\n\nClick the button again to leave the giveaway.`),
      ],
    });
  }
}

// ─── Reroll Handler ──────────────────────────────────────────────────────────

async function handleReroll(client: ExtendedClient, btn: ButtonInteraction): Promise<void> {
  const messageId = btn.message.id;
  const giveaway = await Giveaway.findOne({ messageId });
  if (!giveaway) {
    await btn.deferUpdate();
    return;
  }

  // Host-only check
  if (btn.user.id !== giveaway.hostId) {
    await btn.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setDescription(`${getEmoji(client, 'error')} ${translate('giveaway.reroll.hostOnly', 'en')}`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await btn.deferUpdate();

  if (giveaway.participants.size === 0) return;

  const channel = btn.channel as TextChannel | undefined;
  if (channel && 'send' in channel) {
    await performReroll(client, giveaway, channel);
  }
}

export async function performReroll(client: ExtendedClient, giveaway: IGiveaway, channel: TextChannel): Promise<string | null> {
  // Pick new winner
  const newWinner = pickWeightedWinner(giveaway);
  if (!newWinner) return null;

  giveaway.winnerId = newWinner;
  await giveaway.save();

  const botAvatar = client.user?.displayAvatarURL({ size: 256 }) ?? '';

  const rerollContainer = buildGiveawayContainer({
    prize: giveaway.prize,
    description: giveaway.description,
    imageUrl: giveaway.imageUrl,
    createdAt: giveaway.createdAt,
    endsAt: giveaway.endsAt,
    participantCount: giveaway.participants.size,
    botAvatar,
    lang: 'en',
    ended: true,
    winnerId: newWinner,
    embedColor: giveaway.embedColor,
    buttonStyle: giveaway.buttonStyle,
    buttonLabel: giveaway.buttonLabel,
    buttonEmoji: giveaway.buttonEmoji,
  });

  try {
    const msg = await channel.messages.fetch(giveaway.messageId);
    await msg.edit({
      components: [rerollContainer.toJSON() as any],
      flags: MessageFlags.IsComponentsV2,
    } as any);
  } catch (err) {
    log.events.error({ err, messageId: giveaway.messageId }, '[giveaway] Error editing reroll message');
  }

  // Send new congratulations
  await channel.send(
    `🎉 Congratulations <@${newWinner}>! You are the new winner of: **${giveaway.prize}**!`
  );

  return newWinner;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function updateGiveawayMessage(client: ExtendedClient, giveaway: IGiveaway): Promise<void> {
  try {
    const channel = client.channels.cache.get(giveaway.channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;

    const msg = await channel.messages.fetch(giveaway.messageId);
    const botAvatar = client.user?.displayAvatarURL({ size: 256 }) ?? '';

    const updContainer = buildGiveawayContainer({
      prize: giveaway.prize,
      description: giveaway.description,
      imageUrl: giveaway.imageUrl,
      createdAt: giveaway.createdAt,
      endsAt: giveaway.endsAt,
      participantCount: giveaway.participants.size,
      botAvatar,
      lang: 'en',
      ended: false,
      embedColor: giveaway.embedColor,
      buttonStyle: giveaway.buttonStyle,
      buttonLabel: giveaway.buttonLabel,
      buttonEmoji: giveaway.buttonEmoji,
    });

    await msg.edit({
      components: [updContainer.toJSON() as any],
      flags: MessageFlags.IsComponentsV2,
    } as any);
  } catch (err) {
    log.events.error({ err, messageId: giveaway.messageId }, '[giveaway] Error updating message');
  }
}

export default event;
