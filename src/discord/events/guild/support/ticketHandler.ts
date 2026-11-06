/**
 * TICKET HANDLER EVENT
 * Persistent handler for ticket system interactions:
 * - ticket_open         → shows language selection (ephemeral)
 * - ticket_lang_XX      → shows topic select in that language (ephemeral)
 * - ticket_create_TOPIC → creates the ticket channel
 * - ticket_close        → closes the ticket (staff only)
 */

import {
  Events,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { getEmoji, getEmojiButtonComponent, getEmojiCdnUrl, EMOJI_IDS } from '#helpers/core/emojis.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import Ticket from '#models/Ticket.ts';
import { TICKET_TRANSLATIONS, type TicketLang } from '#helpers/discord/tickets/ticketTranslations.ts';
import {
  buildPlanId,
  periodsForTier,
  PLAN_PRICE_EUR,
  type BillingPeriod,
  type PremiumPlanId,
  type ProductTier,
} from '#helpers/discord/tickets/premiumTicketCatalog.ts';
import { isSupportedLanguage } from '#helpers/locales/languages.ts';
import { generateTranscriptHtml } from '#helpers/discord/tickets/transcriptGenerator.ts';
import { isPremiumCheckBypassed } from '#helpers/core/client/premium.ts';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';

const TICKET_STAFF_ROLES = (process.env.TICKET_STAFF_ROLES ?? '').split(',').map(id => id.trim()).filter(Boolean);
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID ?? '';
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID ?? '';
const DEVELOPER_IDS = (process.env.DEVELOPER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);

type TopicKey = 'premium' | 'bot_support' | 'server_issues' | 'other';
const TOPICS: TopicKey[] = ['premium', 'bot_support', 'server_issues', 'other'];
const TOPIC_EMOJIS: Record<TopicKey, string> = {
  premium: '⭐',
  bot_support: '🤖',
  server_issues: '🛡️',
  other: '📝',
};

const PAYMENT_LOG_CHANNEL_ID = '1489018783522885762';

// ─── Helpers ─────────────────────────────────────────────

function isStaff(memberRoles: string[]): boolean {
  return memberRoles.some(r => TICKET_STAFF_ROLES.includes(r));
}

// ─── Event ───────────────────────────────────────────────

const event: BotEvent<'interactionCreate'> = {
  name: Events.InteractionCreate,
  once: false,

  async execute(client: ExtendedClient, interaction) {
    // ─── Button handling ─────────────────────────
    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction;

      // Panel language buttons → show topic select (ticket_lang_XX)
      if (btn.customId.startsWith('ticket_lang_')) {
        const lang = btn.customId.replace('ticket_lang_', '');
        if (isSupportedLanguage(lang) && TICKET_TRANSLATIONS[lang]) {
          return handleTopicSelect(btn, lang);
        }
      }

      // Close ticket button
      if (btn.customId === 'ticket_close') {
        return handleCloseTicket(client, btn);
      }

      return;
    }

    // ─── Select menu handling ────────────────────
    if (interaction.isStringSelectMenu()) {
      const select = interaction as StringSelectMenuInteraction;

      // Topic selection → create ticket (or show premium plan selector)
      if (select.customId.startsWith('ticket_topic_')) {
        const lang = select.customId.replace('ticket_topic_', '') as TicketLang;
        const topic = select.values[0] as TopicKey;

        // Premium topic → show plan selector first
        if (topic === 'premium') {
          if (isPremiumCheckBypassed()) {
            return void await select.reply({
              content: `ℹ️ El sistema premium se encuentra temporalmente desactivado y todas las funciones son 100% gratuitas para todos los usuarios. No es necesario adquirir ningún plan en este momento.`,
              flags: MessageFlags.Ephemeral,
            });
          }
          return handlePremiumTierSelect(client, select, lang);
        }

        return handleCreateTicket(client, select, lang, topic);
      }

      if (select.customId.startsWith('ticket_premium_tier_')) {
        if (isPremiumCheckBypassed()) {
          return void await select.reply({
            content: `ℹ️ El sistema premium se encuentra temporalmente desactivado y todas las funciones son 100% gratuitas para todos los usuarios.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        const lang = select.customId.replace('ticket_premium_tier_', '');
        if (!isSupportedLanguage(lang)) return;
        const tier = select.values[0] as ProductTier;
        return handlePremiumDurationSelect(client, select, lang, tier);
      }

      if (select.customId.startsWith('ticket_premium_period_')) {
        if (isPremiumCheckBypassed()) {
          return void await select.reply({
            content: `ℹ️ El sistema premium se encuentra temporalmente desactivado y todas las funciones son 100% gratuitas para todos los usuarios.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        const rest = select.customId.replace('ticket_premium_period_', '');
        const sep = rest.lastIndexOf('_');
        if (sep <= 0) return;
        const lang = rest.slice(0, sep);
        const tier = rest.slice(sep + 1) as ProductTier;
        if (!isSupportedLanguage(lang)) return;
        const period = select.values[0] as BillingPeriod;
        return handleCreatePremiumTicket(client, select, lang, tier, period);
      }

      return;
    }
  },
};

// ─── Panel language button → show topic select (ephemeral) ─────

async function handleTopicSelect(btn: ButtonInteraction, lang: TicketLang): Promise<void> {
  await btn.deferReply({ flags: MessageFlags.Ephemeral });

  const t = TICKET_TRANSLATIONS[lang];
  if (!t) return;

  const topicsList = isPremiumCheckBypassed()
    ? TOPICS.filter(topic => topic !== 'premium')
    : TOPICS;

  const topicMenu = new StringSelectMenuBuilder()
    .setCustomId(`ticket_topic_${lang}`)
    .setPlaceholder(t.selectPlaceholder)
    .addOptions(
      topicsList.map(topic =>
        new StringSelectMenuOptionBuilder()
          .setLabel(t.topics[topic].replace(/^[^\s]+\s/, '')) // Remove emoji prefix from label (set via .setEmoji)
          .setValue(topic)
          .setDescription(t.topicDescriptions[topic])
          .setEmoji(TOPIC_EMOJIS[topic])
      )
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(topicMenu);

  await btn.editReply({
    content: `**${t.flag} ${t.label}**`,
    components: [row],
  });
}

// ─── Premium topic → tier then duration (ephemeral) ─────

function tierEmojiComponent(tier: ProductTier): { id: string; name: string } | string {
  const key = tier === 'basic' ? 'premium_basic' : tier === 'pro' ? 'premium_pro' : 'premium_ultimate';
  return getEmojiButtonComponent(key) ?? getEmojiButtonComponent('premium') ?? '⭐';
}

function buildPremiumTierMenu(lang: TicketLang, t: TicketTranslation): StringSelectMenuBuilder {
  const tiers: ProductTier[] = ['basic', 'pro', 'ultimate'];
  return new StringSelectMenuBuilder()
    .setCustomId(`ticket_premium_tier_${lang}`)
    .setPlaceholder(t.premium.tierPlaceholder)
    .addOptions(
      tiers.map(tier =>
        new StringSelectMenuOptionBuilder()
          .setLabel(t.premium[tier])
          .setValue(tier)
          .setDescription((tier === 'basic' ? t.premium.basicDesc : tier === 'pro' ? t.premium.proDesc : t.premium.ultimateDesc).slice(0, 100))
          .setEmoji(tierEmojiComponent(tier)),
      ),
    );
}

function buildPremiumDurationMenu(lang: TicketLang, tier: ProductTier, t: TicketTranslation): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ticket_premium_period_${lang}_${tier}`)
    .setPlaceholder(t.premium.durationPlaceholder);

  for (const period of periodsForTier(tier)) {
    const labelKey = period === 'monthly' ? 'monthly' : period === 'annual' ? 'annual' : 'lifetime';
    const descKey = `${labelKey}Desc` as 'monthlyDesc';
    const planId = buildPlanId(tier, period);
    const price = PLAN_PRICE_EUR[planId];
    const desc = `${t.premium[descKey].slice(0, 70)} · ${price}€`;
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(t.premium[labelKey])
        .setValue(period)
        .setDescription(desc.slice(0, 100))
        .setEmoji(tierEmojiComponent(tier)),
    );
  }
  return menu;
}

type TicketTranslation = (typeof TICKET_TRANSLATIONS)[TicketLang];

async function handlePremiumTierSelect(
  client: ExtendedClient,
  select: StringSelectMenuInteraction,
  lang: TicketLang,
): Promise<void> {
  const t = TICKET_TRANSLATIONS[lang];
  if (!t) {
    await select.reply({ content: 'Language not supported.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }

  const premiumEmoji = getEmoji(client, 'premium');
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildPremiumTierMenu(lang, t));

  await select.update({
    content: `**${premiumEmoji} ${t.premium.selectTier}**`,
    components: [row],
  }).catch(async (err) => {
    log.events.error({ err, lang }, '[ticketHandler] Premium tier selector failed');
    await select.reply({ content: `${getEmoji(client, 'error')} Could not show tier menu.`, flags: MessageFlags.Ephemeral }).catch(() => {});
  });
}

async function handlePremiumDurationSelect(
  client: ExtendedClient,
  select: StringSelectMenuInteraction,
  lang: TicketLang,
  tier: ProductTier,
): Promise<void> {
  const t = TICKET_TRANSLATIONS[lang];
  if (!t) return;

  const tierLabel = t.premium[tier];
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    buildPremiumDurationMenu(lang, tier, t),
  );

  await select.update({
    content: `**${tierLabel}** — ${t.premium.selectDuration}`,
    components: [row],
  });
}

function formatPeriodLabel(t: TicketTranslation, period: BillingPeriod): string {
  if (period === 'monthly') return t.premium.monthly;
  if (period === 'annual') return t.premium.annual;
  return t.premium.lifetime;
}

/**
 * The user's open ticket, if its channel still exists. A ticket whose channel was deleted by hand
 * is closed in the DB and does not count, so it cannot block opening a new one.
 */
async function findLiveOpenTicket(select: StringSelectMenuInteraction) {
  const guild = select.guild!;
  const open = await Ticket.find({ userId: select.user.id, guildId: guild.id, status: 'open' });
  for (const ticket of open) {
    const channel = await guild.channels.fetch(ticket.channelId).catch((err: any) => (err?.code === 10003 ? null : undefined));
    // undefined = Discord could not be reached: assume it still exists rather than allow duplicates
    if (channel !== null) return ticket;

    ticket.status = 'closed';
    ticket.closedBy = 'system:channel-deleted';
    ticket.closedAt = new Date();
    await ticket.save();
    log.bot.info({ ticketId: ticket._id, channelId: ticket.channelId, userId: select.user.id }, '[TICKETS] Open ticket had no channel — closed');
  }
  return null;
}

// ─── Premium plan selected → create premium ticket ──────

async function handleCreatePremiumTicket(
  client: ExtendedClient,
  select: StringSelectMenuInteraction,
  lang: TicketLang,
  tier: ProductTier,
  period: BillingPeriod,
): Promise<void> {
  await select.deferUpdate();

  const t = TICKET_TRANSLATIONS[lang];
  if (!t || !select.guild) return;

  // Check if user already has an open ticket
  const existing = await findLiveOpenTicket(select);
  if (existing) {
    await select.editReply({ content: `${getEmoji(client, 'error')} ${t.alreadyOpen} → <#${existing.channelId}>`, components: [] });
    return;
  }

  // Build permission overwrites
  const permissionOverwrites = [
    { id: select.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: select.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
    { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
    ...TICKET_STAFF_ROLES.map(roleId => ({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
    })),
  ];

  const channelName = `premium-${select.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;

  let channel: TextChannel;
  try {
    channel = await select.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID || undefined,
      permissionOverwrites,
    }) as TextChannel;
  } catch (err) {
    log.events.error({ err }, '[ticketHandler] Failed to create premium ticket channel');
    await select.editReply({ content: `${getEmoji(client, 'error')} Could not create ticket channel. Contact an admin.`, components: [] });
    return;
  }

  const planId = buildPlanId(tier, period);

  // Create DB entry with premium plan SKU
  await Ticket.create({
    channelId: channel.id,
    guildId: select.guild.id,
    userId: select.user.id,
    userTag: select.user.tag,
    topic: 'premium',
    premiumTier: tier,
    premiumPlan: planId,
    language: lang,
    status: 'open',
    messages: [],
  });

  // Update ephemeral reply
  await select.editReply({ content: `${getEmoji(client, 'success')} ${t.premium.welcomeTitle} → <#${channel.id}>`, components: [] });

  // Mention staff + user above the embed
  const rolePings = TICKET_STAFF_ROLES.map(r => `<@&${r}>`).join(' ');
  if (rolePings) {
    try {
      await channel.send({ content: `${rolePings} — <@${select.user.id}>` });
    } catch {}
  }

  // Premium welcome container (gold accent — EMBED_COLORS.info)
  const tierLabel = t.premium[tier];
  const periodLabel = formatPeriodLabel(t, period);
  const planLabel = `${tierLabel} — ${periodLabel}`;
  const descWithPlan = t.premium.welcomeDesc
    .replace('{tier}', tierLabel)
    .replace('{period}', periodLabel)
    .replace('{plan}', planLabel);
  const premiumEmoji = getEmoji(client, 'premium');
  const premiumThumbnail = getEmojiCdnUrl('premium')
    ?? `https://cdn.discordapp.com/emojis/${EMOJI_IDS.premium}.webp?size=128`;

  const container = new ContainerBuilder()
    .setAccentColor(EMBED_COLORS.info);

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${premiumEmoji} ${t.premium.welcomeTitle}`)
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(premiumThumbnail))
  );

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**${t.premium.tierLabel}:** ${tierLabel}\n**${t.premium.planLabel}:** ${periodLabel} (${PLAN_PRICE_EUR[planId]}€)\n\n${descWithPlan}\n\n${t.premium.webHint}\n\n${t.premium.paymentLinks}\n\n${t.premium.sendPayment}\n\n-# ${t.premium.staffHelp}\n-# ${t.premium.reviewNotice}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# <@${select.user.id}> — <t:${Math.floor(Date.now() / 1000)}:f>`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel(t.welcome.closeButton)
      .setStyle(ButtonStyle.Danger)
  );
  container.addActionRowComponents(closeRow);

  try {
    await channel.send({
      components: [container.toJSON() as any],
      flags: MessageFlags.IsComponentsV2,
    } as any);
  } catch (err) {
    log.events.error({ err }, '[ticketHandler] Failed to send premium welcome container');
  }

  log.events.info(
    { channelId: channel.id, userId: select.user.id, plan: planId, tier, period, lang },
    '[ticketHandler] Premium ticket created',
  );
}

// ─── Topic selected → create ticket channel ─────────────

async function handleCreateTicket(
  client: ExtendedClient,
  select: StringSelectMenuInteraction,
  lang: TicketLang,
  topic: TopicKey,
): Promise<void> {
  await select.deferUpdate();

  const t = TICKET_TRANSLATIONS[lang];
  if (!t || !select.guild) return;

  // Check if user already has an open ticket
  const existing = await findLiveOpenTicket(select);
  if (existing) {
    await select.editReply({ content: `${getEmoji(client, 'error')} ${t.alreadyOpen} → <#${existing.channelId}>`, components: [] });
    return;
  }

  // Build permission overwrites
  const permissionOverwrites = [
    // Deny everyone
    { id: select.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    // Allow the ticket creator
    { id: select.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
    // Allow the bot
    { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
    // Allow staff roles
    ...TICKET_STAFF_ROLES.map(roleId => ({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
    })),
  ];

  // Create channel
  const channelName = `ticket-${select.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;

  let channel: TextChannel;
  try {
    channel = await select.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID || undefined,
      permissionOverwrites,
    }) as TextChannel;
  } catch (err) {
    log.events.error({ err }, '[ticketHandler] Failed to create ticket channel');
    await select.editReply({ content: `${getEmoji(client, 'error')} Could not create ticket channel. Contact an admin.`, components: [] });
    return;
  }

  // Create DB entry
  const ticket = await Ticket.create({
    channelId: channel.id,
    guildId: select.guild.id,
    userId: select.user.id,
    userTag: select.user.tag,
    topic,
    language: lang,
    status: 'open',
    messages: [],
  });

  // Update ephemeral reply
  await select.editReply({ content: `${getEmoji(client, 'success')} ${t.welcome.title} → <#${channel.id}>`, components: [] });

  // Mention staff roles above the embed (so they get notified)
  const rolePings = TICKET_STAFF_ROLES.map(r => `<@&${r}>`).join(' ');
  if (rolePings) {
    try {
      await channel.send({ content: `${rolePings} — <@${select.user.id}>` });
    } catch {}
  }

  // Send welcome message in the ticket channel (Components V2) with close button inside
  const topicLabel = t.topics[topic];

  const container = new ContainerBuilder()
    .setAccentColor(EMBED_COLORS.info);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${t.welcome.title}\n${t.welcome.description}\n\n**${t.welcome.topicLabel}:** ${topicLabel}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# <@${select.user.id}> — <t:${Math.floor(Date.now() / 1000)}:f>`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  // Close button inside the container
  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel(t.welcome.closeButton)
      .setStyle(ButtonStyle.Danger)
  );
  container.addActionRowComponents(closeRow);

  try {
    await channel.send({
      components: [container.toJSON() as any],
      flags: MessageFlags.IsComponentsV2,
    } as any);
  } catch (err) {
    log.events.error({ err }, '[ticketHandler] Failed to send welcome container');
  }

  log.events.info(
    { channelId: channel.id, userId: select.user.id, topic, lang },
    '[ticketHandler] Ticket created',
  );
}

// ─── Close ticket ────────────────────────────────────────

async function handleCloseTicket(client: ExtendedClient, btn: ButtonInteraction): Promise<void> {
  if (!btn.guild || !btn.member) return;
  await btn.deferReply();

  // Check if staff or developer
  const memberRoles = (btn.member.roles as any)?.cache?.map((r: any) => r.id) ?? [];
  const canClose = isStaff(memberRoles) || DEVELOPER_IDS.includes(btn.user.id);

  const ticket = await Ticket.findOne({ channelId: btn.channelId, status: 'open' });
  if (!ticket) {
    await btn.editReply({ content: `${getEmoji(client, 'error')} No open ticket found for this channel.` });
    return;
  }

  const t = TICKET_TRANSLATIONS[ticket.language as TicketLang] ?? TICKET_TRANSLATIONS.en;

  if (!canClose) {
    await btn.editReply({ content: `${getEmoji(client, 'error')} ${t.noPermission}` });
    return;
  }

  // Mark as closed
  ticket.status = 'closed';
  ticket.closedBy = btn.user.id;
  ticket.closedAt = new Date();
  await ticket.save();

  await btn.editReply({ content: `🔒 ${t.ticketClosed}` });

  // Generate transcript
  const closerTag = btn.user.tag;
  const html = generateTranscriptHtml(ticket, closerTag);
  const buffer = Buffer.from(html, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, { name: `transcript-${ticket.userId}-${ticket.channelId}.html` });

  const SUPPORT_TICKET_URL = 'https://discord.com/channels/810129117260283915/1444045152363483278';

  // Send transcript HTML to log channel
  if (TICKET_LOG_CHANNEL_ID) {
    try {
      const logChannel = await client.channels.fetch(TICKET_LOG_CHANNEL_ID) as TextChannel | null;
      if (logChannel?.isTextBased()) {
        const logContainer = new ContainerBuilder()
          .setAccentColor(EMBED_COLORS.info);

        logContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Ticket Transcript\n**Opened by:** <@${ticket.userId}> (${escapeMarkdown(ticket.userTag)})\n**Closed by:** <@${btn.user.id}> (${escapeMarkdown(closerTag)})\n**Topic:** ${ticket.topic}\n**Messages:** ${ticket.messages.length}\n**Created:** <t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>\n**Closed:** <t:${Math.floor((ticket.closedAt?.getTime() ?? Date.now()) / 1000)}:F>`
          )
        );

        // Components V2 and files cannot be in the same message — send separately
        await (logChannel as TextChannel).send({
          components: [logContainer.toJSON() as any],
          flags: MessageFlags.IsComponentsV2,
        } as any);

        await (logChannel as TextChannel).send({ files: [attachment] });
      }
    } catch (err) {
      log.events.error({ err }, '[ticketHandler] Failed to send transcript to log channel');
    }
  }

  // DM the user (text + support link, no HTML file)
  try {
    const user = await client.users.fetch(ticket.userId);
    await user.send({
      content: `${t.closed.dm}\n${SUPPORT_TICKET_URL}`,
    });
  } catch (err) {
    log.events.warn({ err, userId: ticket.userId }, '[ticketHandler] Could not DM user');
  }

  log.events.info(
    { channelId: btn.channelId, closedBy: btn.user.id, userId: ticket.userId },
    '[ticketHandler] Ticket closed',
  );

  // Delete channel after a short delay
  setTimeout(async () => {
    try {
      const ch = await client.channels.fetch(btn.channelId!);
      if (ch) await ch.delete();
    } catch (err) {
      log.events.warn({ err }, '[ticketHandler] Could not delete ticket channel');
    }
  }, 5000);
}

// ─── Utils ───────────────────────────────────────────────

function escapeMarkdown(text: string): string {
  return text.replace(/([*_~`|\\])/g, '\\$1');
}

export default event;
