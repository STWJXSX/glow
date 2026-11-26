/**
 * COMANDO /TWITCHDROPS
 * Campañas de Twitch Drops de Fortnite activas ahora mismo (datos del monitor del core)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { callCore } from '#api/glowCore.ts';
import { buildDiscordLocalizations, getUserLanguage } from '#helpers/locales/index.ts';
import {
  buildDropCampaignContainer,
  buildNoDropsContainer,
  type DropCampaign,
} from '#helpers/epic/fn/twitchDrops/twitchDropsView.ts';
import type { Command } from '#structures/types.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('twitchdrops')
    .setDescription('View the current Fortnite Twitch Drops')
    .setDescriptionLocalizations(buildDiscordLocalizations('twitchDrops.cmdDescription'))
    .setDMPermission(true) as SlashCommandBuilder,

  auth: false,
  nodefer: false,
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction) {
    const lang = await getUserLanguage(interaction.user.id, interaction.locale);
    const campaigns = await callCore<DropCampaign[]>('feeds.twitchDrops.list');

    if (!campaigns.length) {
      await interaction.editReply({
        content: null,
        embeds: [],
        components: [buildNoDropsContainer(lang)],
        flags: MessageFlags.IsComponentsV2,
      } as any);
      return;
    }

    // One message per campaign: a Components V2 message is capped at 40 components.
    const [first, ...rest] = campaigns;
    await interaction.editReply({
      content: null,
      embeds: [],
      components: [buildDropCampaignContainer(first, lang, 'info')],
      flags: MessageFlags.IsComponentsV2,
    } as any);
    for (const campaign of rest.slice(0, 4)) {
      await interaction.followUp({
        components: [buildDropCampaignContainer(campaign, lang, 'info')],
        flags: MessageFlags.IsComponentsV2,
      } as any);
    }
  },
};

export default command;
