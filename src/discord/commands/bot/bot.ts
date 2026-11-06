/**
 * COMANDO /bot
 * Subcommands: info, credits, ping
 *
 * info    - Bot statistics, library, network, DB size, languages, website button
 * credits - Team credits (owner, code helpers, junior helpers, testers)
 * ping    - Detailed network + system performance info
 *
 * All subcommands use Components V2.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  version as djsVersion,
} from 'discord.js';
import os from 'os';
import mongoose from 'mongoose';
import type { Command } from '#structures/types.ts';
import { getTranslations, buildDiscordLocalizations } from '#helpers/locales/index.ts';
import {
  createV2Container,
  embedStyleFromLatency,
  getDeveloperFooter,
  replyComponentsV2,
} from '#helpers/core/embedHelper.ts';
import {
  collectNetworkPingDiagnostics,
  effectiveNetworkLatency,
  formatHostAddresses,
  formatPingMs,
  formatShardPingSummary,
} from '#helpers/discord/bot/pingDiagnostics.ts';
import GlowPremium from '#models/premium/GlowPremium.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import CommunityLoadout from '#models/CommunityLoadout.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

const WEBSITE_URL = 'https://glowhaven.space';

const OWNER_LINK = '[stw_jxsx](https://discord.com/users/807586817581908008)';
const CODE_HELPERS = [
  '[espiroaka](https://discord.com/users/755913151693717556)',
  '[Pako](https://discord.com/users/345349877502574595)',
];
const JUNIOR_HELPERS = [
  '[adrusss](https://discord.com/users/427136807147405312)',
  '[ilovedownies69](https://discord.com/users/1304814838291107994)',
];

// ── Shared helpers ────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ── /bot info ─────────────────────────────────────────────────────────────────

async function handleInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const trans = await getTranslations(interaction);
  const client = interaction.client;

  // Parallel DB queries
  const [totalAuths, premiumActive, loadoutsCount] = await Promise.all([
    UsuarioInfo.countDocuments(),
    GlowPremium.countDocuments({ isActive: true }),
    CommunityLoadout.countDocuments(),
  ]);

  // MongoDB storage size
  let dbSizeStr = 'N/A';
  try {
    const stats = await (mongoose.connection.db as any)!.command({ dbStats: 1 });
    dbSizeStr = formatBytes(stats.dataSize as number);
  } catch { /* not critical */ }

  const totalServers = client.guilds.cache.size;
  const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  // Unique non-bot user IDs across all cached guilds
  const uniqueUsers = new Set<string>();
  client.guilds.cache.forEach(g =>
    g.members.cache.forEach(m => { if (!m.user.bot) uniqueUsers.add(m.user.id); }),
  );
  const shards = client.shard?.count ?? 1;
  const uptime = formatUptime(Math.floor(process.uptime()));
  const wsPing = client.ws.ping;
  const botAvatar = client.user?.displayAvatarURL({ size: 256 }) ?? '';

  const container = createV2Container('info');

  // ── Header section ────────────────────────────────────────────────────────
  container.addSectionComponents(
    new SectionBuilder()
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `## ${client.user?.username ?? 'Glow'}`,
            `**${trans.bot.info.library}:** node.js \`${process.version}\` · discord.js \`v${djsVersion}\``,
            `**${trans.bot.info.network}:** WebSocket \`${wsPing}ms\``,
          ].join('\n'),
        ),
      ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  // ── Statistics ────────────────────────────────────────────────────────────
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `**${trans.bot.info.installedServers}:** \`${totalServers.toLocaleString()}\` · **${trans.bot.info.installedUsers}:** \`${uniqueUsers.size.toLocaleString()}\` · **${trans.bot.info.members}:** \`${totalMembers.toLocaleString()}\``,
        `**${trans.bot.info.registeredAuths}:** \`${totalAuths.toLocaleString()}\` · **${trans.bot.info.onlineTime}:** \`${uptime}\` · **${trans.bot.info.premiumUsers}:** \`${premiumActive.toLocaleString()}\``,
        `**${trans.bot.info.totalShards}:** \`${shards}\` · **${trans.bot.info.dbSize}:** \`${dbSizeStr}\` · **${trans.bot.info.communityLoadouts}:** \`${loadoutsCount.toLocaleString()}\``,
      ].join('\n'),
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  // ── Language coverage ─────────────────────────────────────────────────────
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**${trans.bot.info.languages}:** ${trans.bot.cmd.languagesLine}`,
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  // ── System ────────────────────────────────────────────────────────────────
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model?.trim().replace(/\s+/g, ' ') ?? 'Unknown';
  const cpuCores = cpus.length;
  const cpuSpeed = cpus[0]?.speed ?? 0;
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const usedRam = totalRam - freeRam;
  const procMem = process.memoryUsage();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `### ${trans.bot.info.systemSection}`,
        `**CPU:** \`${cpuModel}\` — ${cpuCores} cores @ ${cpuSpeed} MHz`,
        `**RAM (system):** \`${formatBytes(usedRam)}\` used / \`${formatBytes(totalRam)}\` total — free \`${formatBytes(freeRam)}\``,
        `**RAM (process):** RSS \`${formatBytes(procMem.rss)}\` · Heap \`${formatBytes(procMem.heapUsed)}\` / \`${formatBytes(procMem.heapTotal)}\``,
        `**OS:** \`${os.platform()} ${os.arch()}\` — kernel \`${os.release()}\``,
        `**Node.js:** \`${process.version}\` · discord.js \`v${djsVersion}\``,
      ].join('\n'),
    ),
  );

  // ── Website button inside the container ───────────────────────────────────
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(trans.bot.info.websiteBtn.toString())
        .setStyle(ButtonStyle.Link)
        .setURL(WEBSITE_URL),
    ),
  );

  await replyComponentsV2(interaction, container);
}

// ── /bot credits ──────────────────────────────────────────────────────────────

async function handleCredits(interaction: ChatInputCommandInteraction): Promise<void> {
  const trans = await getTranslations(interaction);
  const client = interaction.client;
  const botAvatar = client.user?.displayAvatarURL({ size: 256 }) ?? '';

  const container = createV2Container('info');

  // Header
  container.addSectionComponents(
    new SectionBuilder()
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${trans.bot.credits.title}`),
      ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  // Owner & Developer
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${trans.bot.credits.owner}\n${OWNER_LINK}`,
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  // Code Helpers
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${trans.bot.credits.codeHelper}\n${CODE_HELPERS.join('\n')}`,
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  // Junior Helpers
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${trans.bot.credits.juniorHelper}\n${JUNIOR_HELPERS.join('\n')}`,
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  // Testers (empty for now)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${trans.bot.credits.tester}: ${trans.bot.credits.noTesters}`,
    ),
  );

  await replyComponentsV2(interaction, container);
}

// ── /bot ping ─────────────────────────────────────────────────────────────────

async function handlePing(interaction: ChatInputCommandInteraction): Promise<void> {
  const startedAt = Date.now();
  const trans = await getTranslations(interaction);
  const client = interaction.client;
  const diag = await collectNetworkPingDiagnostics(client, startedAt);
  const totalResponseMs = Date.now() - startedAt;
  const botAvatar = client.user?.displayAvatarURL({ size: 256 }) ?? '';

  const pingStyle = embedStyleFromLatency(effectiveNetworkLatency(diag));
  const statusLabel =
    pingStyle === 'success'
      ? trans.bot.ping.status.excellent.toString()
      : pingStyle === 'warning'
        ? trans.bot.ping.status.good.toString()
        : trans.bot.ping.status.slow.toString();

  const container = createV2Container(pingStyle);

  container.addSectionComponents(
    new SectionBuilder()
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [`## ${trans.bot.ping.title}`, `**Status:** ${statusLabel}`].join('\n'),
        ),
      ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `### ${trans.bot.ping.gatewaySection}`,
        `**${trans.bot.ping.websocket}:** \`${formatPingMs(diag.wsLatency)}\``,
        `**${trans.bot.ping.gatewayStatus}:** \`${diag.wsStatus}\``,
        `**${trans.bot.ping.shards}:** ${formatShardPingSummary(diag)}`,
      ].join('\n'),
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `### ${trans.bot.ping.restSection}`,
        `**${trans.bot.ping.restApi}:** \`${formatPingMs(diag.discordRestMs)}\``,
        `**${trans.bot.ping.gatewayEndpoint}:** \`${formatPingMs(diag.discordGatewayRestMs)}\``,
        `**${trans.bot.ping.cdn}:** \`${formatPingMs(diag.discordCdnMs)}\``,
      ].join('\n'),
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `### ${trans.bot.ping.dnsSection}`,
        `**discord.com:** \`${formatPingMs(diag.dnsDiscordMs)}\``,
        `**gateway.discord.gg:** \`${formatPingMs(diag.dnsGatewayMs)}\``,
        `**${trans.bot.ping.hostAddresses}:** ${formatHostAddresses(diag.hostAddresses)}`,
      ].join('\n'),
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `### ${trans.bot.ping.interactionSection}`,
        `**${trans.bot.ping.processing}:** \`${formatPingMs(diag.interactionProcessingMs)}\``,
        `**${trans.bot.ping.totalResponse}:** \`${formatPingMs(totalResponseMs)}\``,
      ].join('\n'),
    ),
  );

  const devFooter = await getDeveloperFooter(interaction);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${devFooter.text}`),
  );

  await replyComponentsV2(interaction, container);
}

// ── /bot invite ───────────────────────────────────────────────────────────────

async function handleInvite(interaction: ChatInputCommandInteraction): Promise<void> {
  const trans = await getTranslations(interaction);
  const client = interaction.client;
  const botAvatar = client.user?.displayAvatarURL({ size: 256 }) ?? '';
  const clientId = client.user?.id ?? '';
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=8`;

  const container = createV2Container('info');

  container.addSectionComponents(
    new SectionBuilder()
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${trans.bot.invite.title}`),
      ),
  );

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(trans.bot.invite.inviteBtn.toString())
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl),
    ),
  );

  await replyComponentsV2(interaction, container);
}

// ── Command definition ────────────────────────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Bot information and utilities')
    .setNameLocalizations(buildDiscordLocalizations('bot.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('bot.cmd._1'))
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('View general bot information and statistics')
        .setNameLocalizations(buildDiscordLocalizations('bot.cmd.info.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('bot.cmd.info._1')),
    )
    .addSubcommand(sub =>
      sub
        .setName('credits')
        .setDescription('View the team behind the bot')
        .setNameLocalizations(buildDiscordLocalizations('bot.cmd.credits.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('bot.cmd.credits._1')),
    )
    .addSubcommand(sub =>
      sub
        .setName('ping')
        .setDescription('Check bot latency and system performance')
        .setNameLocalizations(buildDiscordLocalizations('bot.cmd.ping.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('bot.cmd.ping._1')),
    )
    .addSubcommand(sub =>
      sub
        .setName('invite')
        .setDescription('Get the bot invite link')
        .setNameLocalizations(buildDiscordLocalizations('bot.cmd.invite.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('bot.cmd.invite._1')),
    ),

  cooldown: 5,
  auth: false,
  nodefer: false,

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'info') return handleInfo(interaction);
    if (sub === 'credits') return handleCredits(interaction);
    if (sub === 'ping') return handlePing(interaction);
    if (sub === 'invite') return handleInvite(interaction);
  },
};

export default command;
