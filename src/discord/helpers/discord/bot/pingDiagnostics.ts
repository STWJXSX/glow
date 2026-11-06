import dns from 'dns/promises';
import os from 'os';
import { Routes, Status, type Client } from 'discord.js';

export interface ShardPingInfo {
  id: number;
  ping: number;
  status: string;
}

export interface NetworkPingDiagnostics {
  wsLatency: number;
  wsStatus: string;
  shards: ShardPingInfo[];
  shardPingMin: number | null;
  shardPingMax: number | null;
  shardPingAvg: number | null;
  discordRestMs: number | null;
  discordGatewayRestMs: number | null;
  discordCdnMs: number | null;
  dnsDiscordMs: number | null;
  dnsGatewayMs: number | null;
  interactionProcessingMs: number;
  hostAddresses: string[];
}

const GATEWAY_STATUS: Record<number, string> = {
  [Status.Ready]: 'Ready',
  [Status.Connecting]: 'Connecting',
  [Status.Reconnecting]: 'Reconnecting',
  [Status.Idle]: 'Idle',
  [Status.Nearly]: 'Nearly',
  [Status.Disconnected]: 'Disconnected',
  [Status.WaitingForGuilds]: 'WaitingForGuilds',
  [Status.Identifying]: 'Identifying',
  [Status.Resuming]: 'Resuming',
};

function resolveGatewayPing(ping: number, fallbackMs: number | null): number {
  if (ping >= 0) return ping;
  return fallbackMs ?? -1;
}

/** Strip legacy blockquote prefix from locale strings (e.g. "> WebSocket"). */
export function cleanPingLocaleLabel(text: string): string {
  return text.replace(/^>\s*/, '').trim();
}

export function formatPingMs(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return 'N/A';
  return `${Math.round(ms)}ms`;
}

export function effectiveNetworkLatency(diag: NetworkPingDiagnostics): number {
  if (diag.wsLatency >= 0) return diag.wsLatency;
  if (diag.shardPingAvg != null && diag.shardPingAvg >= 0) return diag.shardPingAvg;
  if (diag.discordRestMs != null) return diag.discordRestMs;
  if (diag.discordGatewayRestMs != null) return diag.discordGatewayRestMs;
  return diag.interactionProcessingMs;
}

function collectHostAddresses(): string[] {
  const addresses: string[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal) continue;
      addresses.push(`${name}: ${addr.address}`);
    }
  }
  return addresses.slice(0, 6);
}

export function maskIpAddress(address: string): string {
  if (address.includes('.') && !address.includes(':')) {
    const first = address.split('.')[0] ?? '***';
    return `${first}.***.***.***`;
  }
  if (address.includes(':')) {
    const first = address.split(':')[0] ?? '***';
    return `${first}:***`;
  }
  return '***';
}

function collectShardInfo(client: Client, gatewayFallbackMs: number | null): ShardPingInfo[] {
  return [...client.ws.shards.values()].map((shard) => ({
    id: shard.id,
    ping: resolveGatewayPing(shard.ping, gatewayFallbackMs),
    status: GATEWAY_STATUS[shard.status] ?? String(shard.status),
  }));
}

function summarizeShardPings(shards: ShardPingInfo[]): {
  min: number | null;
  max: number | null;
  avg: number | null;
} {
  const valid = shards.map((s) => s.ping).filter((ping) => ping >= 0);
  if (valid.length === 0) return { min: null, max: null, avg: null };
  const sum = valid.reduce((acc, ping) => acc + ping, 0);
  return {
    min: Math.min(...valid),
    max: Math.max(...valid),
    avg: Math.round(sum / valid.length),
  };
}

async function measureHttpHeadMs(url: string): Promise<number | null> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 500) return null;
    return Date.now() - start;
  } catch {
    return null;
  }
}

async function measureDnsMs(hostname: string): Promise<number | null> {
  const start = Date.now();
  try {
    await dns.lookup(hostname);
    return Date.now() - start;
  } catch {
    return null;
  }
}

async function measureDiscordRestMs(client: Client): Promise<number | null> {
  const start = Date.now();
  try {
    await client.rest.get(Routes.user('@me'));
    return Date.now() - start;
  } catch {
    return null;
  }
}

async function measureDiscordGatewayRestMs(client: Client): Promise<number | null> {
  const start = Date.now();
  try {
    await client.rest.get(Routes.gateway());
    return Date.now() - start;
  } catch {
    return null;
  }
}

export async function collectNetworkPingDiagnostics(
  client: Client,
  startedAtMs: number,
): Promise<NetworkPingDiagnostics> {
  const [
    discordRestMs,
    discordGatewayRestMs,
    discordCdnMs,
    dnsDiscordMs,
    dnsGatewayMs,
  ] = await Promise.all([
    measureDiscordRestMs(client),
    measureDiscordGatewayRestMs(client),
    measureHttpHeadMs('https://cdn.discordapp.com/embed/avatars/0.png'),
    measureDnsMs('discord.com'),
    measureDnsMs('gateway.discord.gg'),
  ]);

  const shards = collectShardInfo(client, discordGatewayRestMs);
  const { min, max, avg } = summarizeShardPings(shards);

  return {
    wsLatency: resolveGatewayPing(client.ws.ping, discordGatewayRestMs),
    wsStatus: GATEWAY_STATUS[client.ws.status] ?? String(client.ws.status),
    shards,
    shardPingMin: min,
    shardPingMax: max,
    shardPingAvg: avg,
    discordRestMs,
    discordGatewayRestMs,
    discordCdnMs,
    dnsDiscordMs,
    dnsGatewayMs,
    interactionProcessingMs: Math.max(0, Date.now() - startedAtMs),
    hostAddresses: collectHostAddresses(),
  };
}

export function formatShardPingSummary(diag: NetworkPingDiagnostics): string {
  if (diag.shards.length === 0) return 'N/A';

  if (diag.shards.length === 1) {
    const shard = diag.shards[0];
    return `Shard ${shard.id} · \`${formatPingMs(shard.ping)}\` · ${shard.status}`;
  }

  const summary = [
    `${diag.shards.length} shards`,
    diag.shardPingAvg != null ? `avg ${formatPingMs(diag.shardPingAvg)}` : null,
    diag.shardPingMin != null ? `min ${formatPingMs(diag.shardPingMin)}` : null,
    diag.shardPingMax != null ? `max ${formatPingMs(diag.shardPingMax)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const details = diag.shards
    .map((shard) => `Shard ${shard.id} · \`${formatPingMs(shard.ping)}\` · ${shard.status}`)
    .join('\n');

  return `${summary}\n${details}`;
}

export function formatHostAddresses(addresses: string[]): string {
  if (addresses.length === 0) return 'N/A';
  return addresses
    .map((entry) => {
      const separator = entry.indexOf(': ');
      if (separator === -1) return `\`${entry}\``;
      const name = entry.slice(0, separator);
      const address = entry.slice(separator + 2);
      return `\`${name}: ${maskIpAddress(address)}\``;
    })
    .join(' · ');
}
