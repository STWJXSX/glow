import { ChatInputCommandInteraction, Collection } from 'discord.js';
import type { ExtendedClient, Command } from '#structures/types.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { getEmoji } from '../emojis.ts';
import { log } from '../logger.ts';
import {
  buildGatewayEmbed,
  PREMIUM_CHANNEL_URL,
} from './gatewayMessageHelper.ts';

/**
 * Resultado de la verificación de cooldown
 */
export interface CooldownResult {
  allowed: boolean;
  remaining?: number;
  /** Unix timestamp (ms) when the cooldown expires */
  expiresAt?: number;
}

/**
 * Verifica y aplica cooldown de forma eficiente
 * Usuarios premium NO tienen cooldown
 * Usuarios NO premium tienen cooldown mínimo de 10 segundos
 */
export function checkCooldown(
  client: ExtendedClient,
  command: Command,
  interaction: ChatInputCommandInteraction,
  isPremium: boolean = false,
): CooldownResult {
  if (isPremium) {
    return { allowed: true };
  }

  const cooldownAmount = Math.max((command.cooldown ?? 3) * 1000, 10000);
  if (cooldownAmount <= 0) return { allowed: true };

  const commandName = command.data.name;
  const userId = interaction.user.id;

  if (!client.cooldowns.has(commandName)) {
    client.cooldowns.set(commandName, new Collection());
  }

  const timestamps = client.cooldowns.get(commandName)!;
  const now = Date.now();

  if (timestamps.has(userId)) {
    const expirationTime = timestamps.get(userId)! + cooldownAmount;

    if (now < expirationTime) {
      const remaining = (expirationTime - now) / 1000;
      return { allowed: false, remaining, expiresAt: expirationTime };
    }
  }

  timestamps.set(userId, now);

  setTimeout(() => {
    timestamps.delete(userId);
    if (timestamps.size === 0) {
      client.cooldowns.delete(commandName);
    }
  }, cooldownAmount);

  return { allowed: true };
}

/**
 * Maneja la respuesta de cooldown al usuario con embed formateado
 */
export async function handleCooldownResponse(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  commandName: string,
  remaining: number,
  expiresAt?: number,
): Promise<void> {
  const userId = interaction.user.id;
  const expiresUnix = Math.ceil((expiresAt ?? Date.now() + remaining * 1000) / 1000);
  const relativeTime = `<t:${expiresUnix}:R>`;
  const premiumEmoji = getEmoji(client, 'premium');

  const premiumNote = await translateForUser(
    userId,
    'cooldown.premiumNote',
    { premium: premiumEmoji, premiumUrl: PREMIUM_CHANNEL_URL },
    interaction.locale,
  );

  const cooldownEmbed = await buildGatewayEmbed(
    client,
    userId,
    interaction.locale,
    'warning',
    {
      emojiKey: 'timer',
      titleKey: 'cooldown.title',
      bodyKey: 'cooldown.description',
      bodyReplacements: { time: relativeTime, command: commandName },
      extraLines: [premiumNote],
    },
  );

  await interaction.editReply({
    content: null,
    embeds: [cooldownEmbed],
    components: [],
    files: [],
  }).catch((err) => {
    log.commands.warn({ command: commandName, err }, 'Error enviando respuesta de cooldown');
  });
}
