import { Client, EmbedBuilder } from 'discord.js';
import { DEVELOPER_USER_ID } from '#helpers/core/embedHelper.ts';
import { getDeveloperIds } from './devAuth.ts';
import { log } from '#helpers/core/logger.ts';

interface MemoryReport {
  generatedAt: string;
  host: { totalMb: number | null; availableMb: number | null; usedMb: number | null };
  thresholds: { warnMb: number; criticalMb: number; restartMb: number; heapLimitMb: number };
  services: Array<{
    id: string;
    name: string;
    status: string | null;
    pid: number | null;
    pm2MemoryMb: number | null;
    rssMb: number | null;
  }>;
}

function monitorEnabled(): boolean {
  return process.env.MEMORY_ALERT_ENABLED !== '0';
}

function intervalMs(): number {
  const raw = Number(process.env.MEMORY_MONITOR_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 30_000 ? raw : 120_000;
}

function cooldownMs(): number {
  const raw = Number(process.env.MEMORY_ALERT_COOLDOWN_MS);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 30 * 60_000;
}

function alertRecipients(): string[] {
  const ids = new Set(getDeveloperIds());
  ids.add(DEVELOPER_USER_ID);
  return [...ids];
}

let lastAlertAt = 0;
let lastAlertLevel: 'warn' | 'critical' | null = null;

async function fetchMemoryReport(): Promise<MemoryReport | null> {
  try {
    const { request } = await import('node:http');
    const host = process.env.BOT_MANAGER_HOST || 'localhost';
    const port = parseInt(process.env.BOT_MANAGER_PORT || '3847', 10);
    const secret = process.env.BOT_MANAGER_SECRET || 'catbot-manager-2024';

    return await new Promise((resolve) => {
      const req = request({
        hostname: host,
        port,
        path: '/memory',
        method: 'GET',
        headers: { Authorization: `Bearer ${secret}` },
        timeout: 10_000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as { success?: boolean; report?: MemoryReport };
            resolve(parsed.success && parsed.report ? parsed.report : null);
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    });
  } catch {
    return null;
  }
}

function pickWebRss(report: MemoryReport): number {
  const web = report.services.find((s) => s.id === 'web');
  return web?.rssMb ?? web?.pm2MemoryMb ?? 0;
}

async function sendMemoryAlert(
  client: Client,
  level: 'warn' | 'critical',
  report: MemoryReport,
  webRssMb: number,
): Promise<void> {
  const { thresholds, host } = report;
  const limit = level === 'critical' ? thresholds.criticalMb : thresholds.warnMb;
  const color = level === 'critical' ? 0xcf0d10 : 0xffc87c;

  const lines = report.services
    .filter((s) => s.rssMb != null || s.pm2MemoryMb != null)
    .map((s) => {
      const rss = s.rssMb ?? s.pm2MemoryMb ?? 0;
      return `**${s.id}**: ${rss.toFixed(0)} MB RSS${s.pm2MemoryMb != null && s.rssMb != null && s.rssMb > s.pm2MemoryMb * 1.2
        ? ` (PM2: ${s.pm2MemoryMb.toFixed(0)} MB)`
        : ''}`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(level === 'critical' ? 'RAM crítica — WebPlatform' : 'RAM alta — WebPlatform')
    .setDescription(
      `**WebPlatform** está usando **${webRssMb.toFixed(0)} MB** (umbral ${level}: ${limit} MB).\n`
      + `Límite heap Node: ${thresholds.heapLimitMb} MB · restart auto: ${thresholds.restartMb} MB`,
    )
    .addFields(
      { name: 'Servicios', value: lines || 'Sin datos', inline: false },
      {
        name: 'Host',
        value: host.totalMb != null
          ? `${host.usedMb ?? '?'} / ${host.totalMb} MB usados · ${host.availableMb ?? '?'} MB disponibles`
          : 'N/A',
        inline: false,
      },
    )
    .setTimestamp(new Date(report.generatedAt));

  if (level === 'critical') {
    embed.setFooter({ text: 'El control reiniciará WebPlatform si supera el límite de restart.' });
  }

  for (const userId of alertRecipients()) {
    try {
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [embed] });
    } catch (err) {
      log.bot.debug(
        { userId, err: err instanceof Error ? err.message : String(err) },
        '[MEM] DM alert failed',
      );
    }
  }
}

async function checkMemory(client: Client): Promise<void> {
  if (!monitorEnabled()) return;

  const report = await fetchMemoryReport();
  if (!report) return;

  const webRssMb = pickWebRss(report);
  if (webRssMb <= 0) return;

  const { warnMb, criticalMb } = report.thresholds;
  let level: 'warn' | 'critical' | null = null;
  if (webRssMb >= criticalMb) level = 'critical';
  else if (webRssMb >= warnMb) level = 'warn';
  if (!level) {
    lastAlertLevel = null;
    return;
  }

  const now = Date.now();
  const sameLevel = level === lastAlertLevel;
  if (sameLevel && now - lastAlertAt < cooldownMs()) return;
  if (!sameLevel && level === 'warn' && lastAlertLevel === 'critical' && now - lastAlertAt < cooldownMs()) {
    return;
  }

  await sendMemoryAlert(client, level, report, webRssMb);
  lastAlertAt = now;
  lastAlertLevel = level;
  log.bot.warn({ webRssMb, level, warnMb, criticalMb }, '[MEM] RAM alert sent');
}

export function startServerMemoryMonitor(client: Client): void {
  if (!monitorEnabled()) {
    log.bot.info('[MEM] Server memory monitor disabled (MEMORY_ALERT_ENABLED=0)');
    return;
  }

  const every = intervalMs();
  log.bot.info({ intervalMs: every }, '[MEM] Server memory monitor started');

  void checkMemory(client);
  const timer = setInterval(() => { void checkMemory(client); }, every);
  timer.unref?.();

  client.once('destroy', () => clearInterval(timer));
}
