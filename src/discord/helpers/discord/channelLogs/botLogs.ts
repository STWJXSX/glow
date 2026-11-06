/**
 * BOT LOGS
 *
 * Central logger for the public logs channel.
 *  - Automation systems call `recordAutomation()` once per Epic account processed; results are
 *    grouped per system (masked account names, OK / error) and flushed as one or more embeds.
 *  - Moderation events (bans, blacklist) go through `sendLogEmbed()` directly.
 *  - After every log message the public stats embed is re-posted so it always stays the last one.
 */

import { EmbedBuilder, type Client } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';

export const LOG_CHANNEL_ID = '1559860125684990012';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const FLUSH_QUIET_MS = 45 * 1000;
const FLUSH_MAX_WAIT_MS = 5 * 60 * 1000;
const CHUNK_CHARS = 3600;
const MAX_EMBEDS_PER_MESSAGE = 10;

/** Systems that are logged publicly. Private ones (security, friend alerts, status) are NOT here. */
export const AUTOMATION_LOG_LABELS = {
  autokick: 'Auto Kick',
  autosac: 'Auto SAC',
  autodaily: 'Auto Daily',
  autoexpediciones: 'Auto Expeditions',
  autobuyfree: 'Auto Buy Free Items',
  autobuyselected: 'Auto Buy Selected Items',
  autoreroll: 'Auto Reroll',
  autoacceptfriends: 'Auto Accept Friends',
  autorecycle: 'Auto Recycle',
  autobuystw: 'Auto Buy STW',
  autopurgefriends: 'Auto Purge Friends',
  autoloadout: 'Auto Loadout',
  autosurvivors: 'Auto Survivors',
  autofreellamas: 'Auto Free Llamas',
} as const;

export type AutomationLogSystem = keyof typeof AUTOMATION_LOG_LABELS;

interface AccountResult {
  name: string;
  ok: boolean;
  detail?: string;
}

interface PendingRun {
  results: AccountResult[];
  firstAt: number;
  timer: NodeJS.Timeout | null;
}

let logClient: Client | null = null;
let thumbnailUrl: string | null = null;
let afterSendHook: (() => void) | null = null;
const pending = new Map<AutomationLogSystem, PendingRun>();
let sendQueue: Promise<void> = Promise.resolve();

// ── Setup ─────────────────────────────────────────────────────────────────────

export function initBotLogs(client: Client, options: { thumbnailUrl?: string | null; afterSend?: () => void }): void {
  logClient = client;
  thumbnailUrl = options.thumbnailUrl ?? null;
  afterSendHook = options.afterSend ?? null;
}

export function setLogThumbnailUrl(url: string | null): void {
  thumbnailUrl = url;
}

export function isBotLogsActive(): boolean {
  return IS_PRODUCTION && logClient !== null;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** `Pri***er` — never shows the full Epic display name or account id. */
export function maskAccountName(name?: string | null): string {
  const s = (name ?? '').trim();
  if (!s) return '***';
  if (s.length <= 4) return `${s[0]}***`;
  return `${s.slice(0, 2)}***${s.slice(-1)}`;
}

/** Short, token-free error reason. */
function sanitizeReason(reason?: string): string {
  if (!reason) return 'Unknown error';
  const firstLine = reason.split('\n')[0] ?? reason;
  const clean = firstLine
    .replace(/eg1~[\w.-]+/gi, '[token]')
    .replace(/\b[0-9a-f]{32}\b/gi, '[id]')
    .replace(/`/g, "'")
    .trim();
  return clean.length > 90 ? `${clean.slice(0, 87)}...` : clean || 'Unknown error';
}

/** Success / error emojis from emojis.ts (falls back to the export file when no client is ready). */
let statusEmojiOverride: Partial<Record<'success' | 'error', string>> = {};

/** Scripts without a gateway client (demos) can provide the rendered emoji strings. */
export function setStatusEmojiOverride(emojis: Partial<Record<'success' | 'error', string>>): void {
  statusEmojiOverride = emojis;
}

function statusEmoji(kind: 'success' | 'error'): string {
  if (statusEmojiOverride[kind]) return statusEmojiOverride[kind]!;
  const client = (logClient ?? { emojis: { cache: new Map() }, application: null }) as unknown as Client;
  return getEmoji(client, kind);
}

function applyBase(embed: EmbedBuilder): EmbedBuilder {
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return embed;
}

export function buildAutomationEmbeds(system: AutomationLogSystem, results: AccountResult[]): EmbedBuilder[] {
  const ok = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const title = `# __${AUTOMATION_LOG_LABELS[system]}__`;
  const okEmoji = statusEmoji('success');
  const errorEmoji = statusEmoji('error');
  const summary = `> **Processed:** \`${results.length}\` · **OK:** \`${ok.length}\` · **Errors:** \`${failed.length}\``;

  const blocks: string[] = [];
  if (failed.length) {
    blocks.push(
      [
        '### __Errors__',
        ...failed.map(r => `> ${errorEmoji} \`${maskAccountName(r.name)}\` · ${sanitizeReason(r.detail)}`),
      ].join('\n'),
    );
  }
  if (ok.length) {
    const lines = ok.map(r => `\`${maskAccountName(r.name)}\`${r.detail ? ` (${r.detail})` : ''}`);
    blocks.push(['### __Processed__', `> ${okEmoji} ${lines.join(' · ')}`].join('\n'));
  }

  // Split into several embeds if it does not fit one description.
  const chunks: string[] = [];
  let current = '';
  const pushLine = (line: string): void => {
    if (current.length + line.length + 1 > CHUNK_CHARS) {
      chunks.push(current);
      current = '';
    }
    current += `${current ? '\n' : ''}${line}`;
  };
  for (const block of blocks) {
    for (const line of block.split('\n')) pushLine(line);
  }
  if (current.trim()) chunks.push(current.trimEnd());

  // Normal color unless EVERY account failed.
  const color = failed.length && !ok.length ? EMBED_COLORS.error : EMBED_COLORS.success;
  return chunks.map((chunk, i) =>
    applyBase(
      new EmbedBuilder()
        .setColor(color)
        .setDescription(i === 0 ? `${title}\n${summary}\n${chunk}` : `${title} · ${i + 1}/${chunks.length}\n${chunk}`),
    ),
  );
}

// ── Sending ───────────────────────────────────────────────────────────────────

/** Sends embeds to the logs channel (serialized), then lets the stats embed move back to the bottom. */
export function sendLogEmbeds(embeds: EmbedBuilder[]): Promise<void> {
  if (!isBotLogsActive() || embeds.length === 0) return Promise.resolve();
  const client = logClient!;

  sendQueue = sendQueue
    .then(async () => {
      try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (!channel?.isTextBased() || !('send' in channel)) return;
        for (let i = 0; i < embeds.length; i += MAX_EMBEDS_PER_MESSAGE) {
          await channel.send({ embeds: embeds.slice(i, i + MAX_EMBEDS_PER_MESSAGE) });
        }
        afterSendHook?.();
      } catch (err) {
        log.bot.error({ err }, '[BOT-LOGS] Failed to send log embeds');
      }
    })
    .catch(() => undefined);
  return sendQueue;
}

export function sendLogEmbed(embed: EmbedBuilder): Promise<void> {
  return sendLogEmbeds([applyBase(embed)]);
}

/** Moderation-style log: `# __Title__` plus `> ` lines. */
export function buildModerationEmbed(
  title: string,
  lines: string[],
  style: 'info' | 'success' | 'warning' | 'error' = 'info',
): EmbedBuilder {
  return applyBase(
    new EmbedBuilder()
      .setColor(EMBED_COLORS[style])
      .setDescription([`# __${title}__`, ...lines.map(line => `> ${line}`)].join('\n')),
  );
}

// ── Automation recording ─────────────────────────────────────────────────────

/**
 * Records one Epic account result for a system. Results are batched: they are flushed after
 * `FLUSH_QUIET_MS` without new records (or `FLUSH_MAX_WAIT_MS` after the first one), or explicitly
 * with `flushAutomation()` at the end of a batch run.
 */
export function recordAutomation(
  system: AutomationLogSystem,
  account: { displayName?: string | null; accountId?: string | null },
  ok: boolean,
  detail?: string,
): void {
  if (!isBotLogsActive()) return;

  let run = pending.get(system);
  if (!run) {
    run = { results: [], firstAt: Date.now(), timer: null };
    pending.set(system, run);
  }
  run.results.push({ name: account.displayName || account.accountId || '', ok, detail });

  if (run.timer) clearTimeout(run.timer);
  const untilMax = Math.max(0, FLUSH_MAX_WAIT_MS - (Date.now() - run.firstAt));
  run.timer = setTimeout(() => void flushAutomation(system), Math.min(FLUSH_QUIET_MS, untilMax));
}

export function flushAutomation(system: AutomationLogSystem): Promise<void> {
  const run = pending.get(system);
  if (!run) return Promise.resolve();
  if (run.timer) clearTimeout(run.timer);
  pending.delete(system);
  if (run.results.length === 0) return Promise.resolve();
  return sendLogEmbeds(buildAutomationEmbeds(system, run.results));
}
