/**
 * V-Bucks prices + giftbots list, posted by Glow in its own server.
 *
 * Mercadona posts the same two messages in its channel. The texts and the price chart come from
 * Mercadona's modules (single source of truth); the giftbot accounts are read from the shared
 * collection Mercadona keeps up to date.
 */

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  type Message,
  type MessageCreateOptions,
  type TextBasedChannel,
} from 'discord.js';
import { GiftBotAccount, GiftMeta } from '#models/GiftBotPool.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { log } from '#helpers/core/logger.ts';

const GUILD_ID = process.env.GLOW_GIFT_PANEL_GUILD_ID?.trim() || '810129117260283915';
const CHANNEL_ID = process.env.GLOW_GIFT_PANEL_CHANNEL_ID?.trim() || '1561485350839525416';
/** Ticket panel of that server, for the "Open a ticket" button. */
const TICKET_CHANNEL_ID = process.env.GLOW_GIFT_PANEL_TICKET_CHANNEL_ID?.trim() || '1551666021671247952';

const PRICES_KEY = `glow_vbucks_prices_panel:${GUILD_ID}`;
const STATUS_KEY = `glow_status_panel:${GUILD_ID}`;
const IMAGE_NAME = 'vbucks-prices.png';

const MERCADONA_GIFTBOTS_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../mercadona/lib/giftbots');
const requireCjs = createRequire(import.meta.url);

interface PanelTexts {
  buildPricesText(emojis: Record<string, string>): string;
  buildStatusText(accounts: unknown[], emojis: Record<string, string>): string;
}

function loadPanelTexts(): PanelTexts {
  return requireCjs(resolve(MERCADONA_GIFTBOTS_DIR, 'panelTexts.js')) as PanelTexts;
}

/** The chart needs Mercadona's canvas dependency; if it is missing the panel is posted without the image. */
async function renderChart(): Promise<Buffer | null> {
  try {
    const mod = requireCjs(resolve(MERCADONA_GIFTBOTS_DIR, 'vbucksPricesChart.js')) as {
      renderVbucksPricesChart(): Promise<Buffer>;
    };
    return await mod.renderVbucksPricesChart();
  } catch (err) {
    log.bot.warn({ err }, '[GIFT-PANELS] Could not render the V-Bucks prices chart');
    return null;
  }
}

function panelEmojis(client: Client): Record<string, string> {
  // Glow has no PayPal / Revolut emojis: those lines are posted as plain text
  return { vbucks: getEmoji(client, 'vbucks'), gift: getEmoji(client, 'gift'), paypal: '', revolut: '' };
}

function ticketButtons(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Open a ticket')
        .setURL(`https://discord.com/channels/${GUILD_ID}/${TICKET_CHANNEL_ID}`),
    ),
  ];
}

/**
 * Edits the stored message in place, or posts a new one. With `anchorMessageId` the message must sit
 * right after it: if anything else is in between it is deleted and re-posted (lands at the bottom).
 */
async function syncMessage(
  channel: TextBasedChannel & { messages: { fetch: (...a: any[]) => Promise<any> }; send: (o: MessageCreateOptions) => Promise<Message> },
  existingId: string,
  anchorMessageId: string | null,
  payload: MessageCreateOptions,
): Promise<Message> {
  if (existingId) {
    const msg: Message | null = await channel.messages.fetch(existingId).catch(() => null);
    if (msg) {
      let inPlace = true;
      if (anchorMessageId) {
        const next = await channel.messages.fetch({ after: anchorMessageId, limit: 1 }).catch(() => null);
        inPlace = next?.first()?.id === msg.id;
      }
      if (inPlace) {
        // attachments: [] makes the new files replace the old ones instead of piling up
        await msg.edit({ ...payload, attachments: [] } as any);
        return msg;
      }
      await msg.delete().catch(() => undefined);
    }
  }
  return channel.send(payload);
}

async function getMeta(key: string) {
  return (await GiftMeta.findOne({ key })) ?? new GiftMeta({ key, channelId: CHANNEL_ID, messageId: '' });
}

export async function refreshGiftPanels(client: Client): Promise<void> {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  const channel = await guild?.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased() || !('send' in channel)) {
    log.bot.warn({ guildId: GUILD_ID, channelId: CHANNEL_ID }, '[GIFT-PANELS] Panel channel not reachable — skipped');
    return;
  }

  const texts = loadPanelTexts();
  const emojis = panelEmojis(client);

  // 1. Prices (text + chart + ticket button)
  const chart = await renderChart();
  const pricesPayload: MessageCreateOptions = {
    content: texts.buildPricesText(emojis),
    embeds: [],
    files: chart ? [new AttachmentBuilder(chart, { name: IMAGE_NAME, description: 'V-Bucks prices compared with the Fortnite store' })] : [],
    components: ticketButtons(),
  };
  const pricesMeta = await getMeta(PRICES_KEY);
  const pricesMsg = await syncMessage(channel as any, pricesMeta.messageId, null, pricesPayload);
  pricesMeta.channelId = CHANNEL_ID;
  pricesMeta.messageId = pricesMsg.id;
  await pricesMeta.save();

  // 2. Giftbots list, right under the prices
  const accounts = await GiftBotAccount.find({}).sort({ displayName: 1 }).lean();
  const statusPayload: MessageCreateOptions = {
    content: texts.buildStatusText(accounts, emojis),
    embeds: [],
    components: [],
  };
  const statusMeta = await getMeta(STATUS_KEY);
  const statusMsg = await syncMessage(channel as any, statusMeta.messageId, pricesMsg.id, statusPayload);
  statusMeta.channelId = CHANNEL_ID;
  statusMeta.messageId = statusMsg.id;
  await statusMeta.save();
}
