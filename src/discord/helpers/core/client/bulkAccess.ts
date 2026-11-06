import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { canUseBulkMode } from './premium.ts';
import { buildPremiumRequiredEmbed } from './gatewayMessageHelper.ts';
import type { ExtendedClient } from '#structures/types.ts';

function applyBulkOption(
  builder: {
    addBooleanOption: (
      input: Parameters<SlashCommandSubcommandBuilder['addBooleanOption']>[0],
    ) => unknown;
  },
  descriptionKey: string,
): void {
  builder.addBooleanOption((opt) =>
    opt
      .setName('bulk')
      .setDescription('Run for all your linked accounts')
      .setNameLocalizations(buildDiscordLocalizations('bulkMode.option.name'))
      .setDescriptionLocalizations(buildDiscordLocalizations(descriptionKey))
      .setRequired(false),
  );
}

/** Adds the standard `bulk` boolean option to a subcommand. */
export function addBulkOption(
  builder: SlashCommandSubcommandBuilder,
  descriptionKey = 'bulkMode.option.description',
): SlashCommandSubcommandBuilder {
  applyBulkOption(builder, descriptionKey);
  return builder;
}

/** Adds the standard `bulk` boolean option to a top-level slash command. */
export function addBulkOptionToCommand(
  builder: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder,
  descriptionKey = 'bulkMode.option.description',
): SlashCommandBuilder | SlashCommandOptionsOnlyBuilder {
  applyBulkOption(builder, descriptionKey);
  return builder;
}

/** True when the slash command has bulk=true (top-level or subcommand option). */
export function isBulkInteraction(interaction: ChatInputCommandInteraction): boolean {
  return interaction.options.getBoolean('bulk') === true;
}

/**
 * When the interaction has bulk=true, ensures Basic+ paid tier (not booster-only).
 */
export async function guardBulkMode(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (!isBulkInteraction(interaction)) return true;

  const allowed = await canUseBulkMode(interaction.user.id, interaction.client);
  if (allowed) return true;

  const embed = await buildPremiumRequiredEmbed(
    interaction.client as ExtendedClient,
    interaction,
    'bulk_premium_required',
  );
  await interaction.editReply({ content: null, embeds: [embed], components: [] }).catch(() => {});
  return false;
}
