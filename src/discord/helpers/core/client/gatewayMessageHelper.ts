/**
 * Gateway messages — embeds for interactionCreate gates (cooldown, auth, premium, etc.).
 */

import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { EMBED_COLORS, type EmbedStyle } from '../embedHelper.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { getEmoji, EMOJI_IDS } from '../emojis.ts';
import type { ExtendedClient } from '#structures/types.ts';

export const PREMIUM_CHANNEL_URL = 'https://discord.com/channels/810129117260283915/1451337495680782367';

type Replacements = Record<string, string | number>;

function quoteBody(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('> ') || trimmed.startsWith('-#')) return line;
      return `> ${trimmed}`;
    })
    .filter(Boolean)
    .join('\n');
}

type EmojiKey = keyof typeof EMOJI_IDS;

type GatewayEmbedOptions = {
  emojiKey?: EmojiKey;
  titleKey: string;
  titleReplacements?: Replacements;
  bodyKey: string;
  bodyReplacements?: Replacements;
  /** Translation key with the steps to fix the problem; rendered under a "How to fix it" label. */
  solutionKey?: string;
  extraLines?: string[];
};

export async function buildGatewayEmbed(
  client: ExtendedClient,
  userId: string,
  locale: string | null | undefined,
  style: EmbedStyle,
  options: GatewayEmbedOptions,
): Promise<EmbedBuilder> {
  const emoji = options.emojiKey ? getEmoji(client, options.emojiKey) : '';
  const titleText = await translateForUser(
    userId,
    options.titleKey,
    options.titleReplacements,
    locale,
  );
  const bodyText = await translateForUser(
    userId,
    options.bodyKey,
    options.bodyReplacements,
    locale,
  );

  let solutionBlock = '';
  if (options.solutionKey) {
    const [label, solution] = await Promise.all([
      translateForUser(userId, 'gateway.howToFix', undefined, locale),
      translateForUser(userId, options.solutionKey, options.bodyReplacements, locale),
    ]);
    solutionBlock = `**${label}**\n${solution}`;
  }

  const description = [quoteBody(bodyText), solutionBlock, ...(options.extraLines ?? [])]
    .filter(Boolean)
    .join('\n\n');

  return new EmbedBuilder()
    .setColor(EMBED_COLORS[style])
    .setTitle(emoji ? `${emoji} ${titleText}` : titleText)
    .setDescription(description);
}

export async function replyGatewayEmbed(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  style: EmbedStyle,
  options: GatewayEmbedOptions,
): Promise<void> {
  const embed = await buildGatewayEmbed(
    client,
    interaction.user.id,
    interaction.locale,
    style,
    options,
  );

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: null, embeds: [embed], components: [], files: [] });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

export async function buildPremiumRequiredEmbed(
  client: ExtendedClient,
  interaction: ChatInputCommandInteraction,
  reason: string,
): Promise<EmbedBuilder> {
  const userId = interaction.user.id;
  const premiumEmoji = getEmoji(client, 'premium');
  const errorMsg = await translateForUser(userId, `errors.${reason}`, undefined, interaction.locale);
  const premiumTitle = await translateForUser(userId, 'gateway.premium.title', undefined, interaction.locale);
  const premiumNote = await translateForUser(
    userId,
    'gateway.premium.note',
    { premium: premiumEmoji, premiumUrl: PREMIUM_CHANNEL_URL },
    interaction.locale,
  );

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.warning)
    .setTitle(`${premiumEmoji} ${premiumTitle}`)
    .setDescription([quoteBody(errorMsg), premiumNote].join('\n\n'))
    .setThumbnail('https://cdn.discordapp.com/emojis/1380628531054248127.webp?size=96')
    .setAuthor({
      name: client.user?.username || 'Glow',
      iconURL: client.user?.displayAvatarURL() || undefined,
    });
}
