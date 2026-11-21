import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations, getUserLanguage, translate, type SupportedLanguage } from '#helpers/locales/index.ts';
import { createEmbed, embedStyleFromLatency } from '#helpers/core/embedHelper.ts';
import {
  cleanPingLocaleLabel,
  collectNetworkPingDiagnostics,
  effectiveNetworkLatency,
  formatHostAddresses,
  formatPingMs,
  formatShardPingSummary,
} from '#helpers/discord/bot/pingDiagnostics.ts';

function pingFieldLabel(key: string, lang: SupportedLanguage): string {
  return cleanPingLocaleLabel(translate(key, lang));
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Shows bot latency and network information')
    .setNameLocalizations(buildDiscordLocalizations('ping.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('ping.cmd._1')),

  cooldown: 5,
  auth: false,
  nodefer: false,

  async execute(interaction: ChatInputCommandInteraction) {
    const startedAt = Date.now();
    const lang = await getUserLanguage(interaction.user.id, interaction.locale) as SupportedLanguage;
    const diag = await collectNetworkPingDiagnostics(interaction.client, startedAt);
    const totalResponseMs = Date.now() - startedAt;

    const pingStyle = embedStyleFromLatency(effectiveNetworkLatency(diag), { excellent: 1000, good: 2000 });
    const status =
      pingStyle === 'success'
        ? pingFieldLabel('ping.status.excellent', lang)
        : pingStyle === 'warning'
          ? pingFieldLabel('ping.status.good', lang)
          : pingFieldLabel('ping.status.slow', lang);

    const embed = await createEmbed({
      style: pingStyle,
      title: translate('ping.embed.title', lang),
      fields: [
        {
          name: translate('ping.fields.gateway', lang),
          value: [
            `**${pingFieldLabel('ping.fields.websocket', lang)}:** \`${formatPingMs(diag.wsLatency)}\``,
            `**${pingFieldLabel('ping.fields.gatewayStatus', lang)}:** \`${diag.wsStatus}\``,
            `**${pingFieldLabel('ping.fields.shards', lang)}:** ${formatShardPingSummary(diag)}`,
          ].join('\n'),
          inline: false,
        },
        {
          name: translate('ping.fields.rest', lang),
          value: [
            `**${pingFieldLabel('ping.fields.restApi', lang)}:** \`${formatPingMs(diag.discordRestMs)}\``,
            `**${pingFieldLabel('ping.fields.gatewayEndpoint', lang)}:** \`${formatPingMs(diag.discordGatewayRestMs)}\``,
            `**${pingFieldLabel('ping.fields.cdn', lang)}:** \`${formatPingMs(diag.discordCdnMs)}\``,
          ].join('\n'),
          inline: false,
        },
        {
          name: translate('ping.fields.dns', lang),
          value: [
            `**discord.com:** \`${formatPingMs(diag.dnsDiscordMs)}\``,
            `**gateway.discord.gg:** \`${formatPingMs(diag.dnsGatewayMs)}\``,
            `**${pingFieldLabel('ping.fields.hostAddresses', lang)}:** ${formatHostAddresses(diag.hostAddresses)}`,
          ].join('\n'),
          inline: false,
        },
        {
          name: translate('ping.fields.interaction', lang),
          value: [
            `**${pingFieldLabel('ping.fields.processing', lang)}:** \`${formatPingMs(diag.interactionProcessingMs)}\``,
            `**${pingFieldLabel('ping.fields.totalResponse', lang)}:** \`${formatPingMs(totalResponseMs)}\``,
            `**${pingFieldLabel('ping.fields.status', lang)}:** ${status}`,
          ].join('\n'),
          inline: false,
        },
      ],
      timestamp: true,
      footer: 'developed',
      interaction,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
