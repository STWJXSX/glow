/**
 * API HTTP INTERNA DEL BOT — Achievements Stats
 *
 * Servidor http nativo (sin dependencias) que expone las estadísticas de un
 * usuario para el sistema de logros. La WebPlatform lo consume vía HTTP como
 * si fuera un servicio externo (sin imports entre carpetas).
 *
 * Rutas:
 *   GET /internal/health
 *   GET /internal/achievements/stats/:discordId
 *   POST /internal/commands/reload
 *   GET  /internal/premium-check
 *   POST /internal/premium-check/global
 *   POST /internal/premium-check/ai
 *
 * Seguridad:
 *   - Bind por defecto en 127.0.0.1 (solo local).
 *   - Bearer GLOW_INTERNAL_API_SECRET obligatorio si se define; si el bind no
 *     es loopback, el secret es obligatorio siempre.
 *
 * Env:
 *   GLOW_BOT_API_PORT   (default 3851)
 *   GLOW_BOT_API_HOST   (default 127.0.0.1)
 *   GLOW_INTERNAL_API_SECRET
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { log } from '../helpers/core/logger.ts';
import { isMongoConnected } from '../events/db/mongodb.ts';
import { checkUserPremium, isBooster } from '../helpers/core/client/premium.ts';
import type { ExtendedClient } from '../structures/types.ts';
import {
  runCheckerWebReport,
  runCheckerWebTextReport,
  generateCheckerWebImagesFromRun,
  generateSingleCheckerImageForRun,
} from '../services/checkerWebReport.ts';
import { getCheckerRun } from '../services/checkerProfileCache.ts';
import { mergeCheckerImageConfig, type CheckerImageKey } from '../helpers/epic/checker/checkerImageConfig.ts';
import { reloadCommands, type CommandReloadResult } from '../handlers/loadCommands.ts';
import { invalidateBlacklistGate } from '../helpers/core/client/blacklistGate.ts';
import { callCore } from './glowCore.ts';
import {
  getPremiumCheckBypassInfo,
  setPremiumCheckBypass,
} from '../helpers/core/client/premium.ts';
import {
  getAiPremiumCheckBypassInfo,
  setAiPremiumCheckBypass,
} from '../helpers/ai/aiPremiumBypass.ts';

import AchievementStats from '#models/AchievementStats.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import GlowPremium from '#models/premium/GlowPremium.ts';

// Sistemas de automatización (todos keyed por discordId con Map `accounts`)
import AutoAcceptFriends from '#models/AutoAcceptFriends.ts';
import AutoAcceptInvites from '#models/AutoAcceptInvites.ts';
import AutoBuyFreeItems from '#models/AutoBuyFreeItems.ts';
import AutoBuySelectedItems from '#models/AutoBuySelectedItems.ts';
import AutoBuySTW from '#models/AutoBuySTW.ts';
import AutoDaily from '#models/AutoDaily.ts';
import AutoExpediciones from '#models/AutoExpediciones.ts';
import AutoFreeLlamas from '#models/AutoFreeLlamas.ts';
import AutoKick from '#models/AutoKick.ts';
import AutoLoadout from '#models/AutoLoadout.ts';
import AutoPurgeFriends from '#models/AutoPurgeFriends.ts';
import AutoRecycle from '#models/AutoRecycle.ts';
import AutoReroll from '#models/AutoReroll.ts';
import AutoSAC from '#models/AutoSAC.ts';
import AutoSecuritySystem from '#models/AutoSecuritySystem.ts';
import AutoSurvivors from '#models/AutoSurvivors.ts';

const AUTOMATION_MODELS: Array<{ name: string; model: { findOne: (q: object) => { lean: () => Promise<unknown> } } }> = [
  { name: 'autoAcceptFriends', model: AutoAcceptFriends },
  { name: 'autoAcceptInvites', model: AutoAcceptInvites },
  { name: 'autoBuyFreeItems', model: AutoBuyFreeItems },
  { name: 'autoBuySelectedItems', model: AutoBuySelectedItems },
  { name: 'autoBuySTW', model: AutoBuySTW },
  { name: 'autoDaily', model: AutoDaily },
  { name: 'autoExpediciones', model: AutoExpediciones },
  { name: 'autoFreeLlamas', model: AutoFreeLlamas },
  { name: 'autoKick', model: AutoKick },
  { name: 'autoLoadout', model: AutoLoadout },
  { name: 'autoPurgeFriends', model: AutoPurgeFriends },
  { name: 'autoRecycle', model: AutoRecycle },
  { name: 'autoReroll', model: AutoReroll },
  { name: 'autoSAC', model: AutoSAC },
  { name: 'autoSecuritySystem', model: AutoSecuritySystem },
  { name: 'autoSurvivors', model: AutoSurvivors },
];

export interface GlowUserStatsPayload {
  discordId: string;
  totalCommands: number;
  uniqueCommands: number;
  commands: Record<string, number>;
  counters: Record<string, number>;
  activeDays: number;
  firstCommandAt: string | null;
  lastCommandAt: string | null;
  tosAccepted: boolean;
  epicAccounts: number;
  automations: number;
  automationSystems: string[];
  premiumGrants: number;
  premiumTierLevel: number;
  premiumTier: string | null;
  booster: boolean;
  generatedAt: string;
}

// ─── Cache en memoria (60s por usuario) ────────────────────────
const CACHE_TTL_MS = 60 * 1000;
const statsCache = new Map<string, { ts: number; data: GlowUserStatsPayload }>();

function mapToRecord(value: unknown): Record<string, number> {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value === 'object') return { ...(value as Record<string, number>) };
  return {};
}

/** ¿Tiene el usuario este sistema configurado con alguna cuenta activa? */
function isAutomationConfigured(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object') return false;
  const accounts = (doc as { accounts?: unknown }).accounts;
  if (accounts == null) return true; // doc existe, sin mapa de cuentas → configurado
  const entries = accounts instanceof Map
    ? [...accounts.values()]
    : Object.values(accounts as Record<string, unknown>);
  return entries.some((acc) => {
    if (!acc || typeof acc !== 'object') return false;
    const isActive = (acc as { isActive?: boolean }).isActive;
    return isActive !== false; // default true si el subdoc no tiene flag
  });
}

export async function buildUserStats(client: ExtendedClient, discordId: string): Promise<GlowUserStatsPayload> {
  const [statsDoc, usuario, premiumGrants, premiumStatus, boosted, autoDocs] = await Promise.all([
    AchievementStats.findOne({ discordId }).lean(),
    UsuarioInfo.findOne({ id: discordId }).select('aceptarTOS deviceAuths.accountId').lean(),
    GlowPremium.countDocuments({ discordId }),
    checkUserPremium(discordId),
    isBooster(discordId, client),
    Promise.all(
      AUTOMATION_MODELS.map(async ({ name, model }) => {
        try {
          const doc = await model.findOne({ discordId }).lean();
          return { name, configured: isAutomationConfigured(doc) };
        } catch {
          return { name, configured: false };
        }
      }),
    ),
  ]);

  const commands = mapToRecord(statsDoc?.commands);
  const counters = mapToRecord(statsDoc?.counters);
  const automationSystems = autoDocs.filter((a) => a.configured).map((a) => a.name);

  return {
    discordId,
    totalCommands: statsDoc?.totalCommands ?? 0,
    uniqueCommands: Object.keys(commands).length,
    commands,
    counters,
    activeDays: statsDoc?.activeDays ?? 0,
    firstCommandAt: statsDoc?.firstCommandAt ? new Date(statsDoc.firstCommandAt).toISOString() : null,
    lastCommandAt: statsDoc?.lastCommandAt ? new Date(statsDoc.lastCommandAt).toISOString() : null,
    tosAccepted: usuario?.aceptarTOS === true,
    epicAccounts: usuario?.deviceAuths?.length ?? 0,
    automations: automationSystems.length,
    automationSystems,
    premiumGrants,
    premiumTierLevel: premiumStatus.tierLevel,
    premiumTier: premiumStatus.tier,
    booster: boosted,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Servidor HTTP ─────────────────────────────────────────────

let server: http.Server | null = null;

function getSecret(): string {
  return process.env.GLOW_INTERNAL_API_SECRET?.trim() || '';
}

function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const secret = getSecret();
  if (secret) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return false;
    const token = header.slice(7).trim();
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // Sin secret configurado: solo loopback
  return isLoopback(req.socket.remoteAddress ?? undefined);
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

const STATS_PATH = /^\/internal\/achievements\/stats\/(\d{17,20})$/;
const CHECKER_RUN_PATH = '/internal/checker/run';
const CHECKER_RUN_TEXT_PATH = '/internal/checker/run/text';
const CHECKER_RUN_IMAGE_PATH = /^\/internal\/checker\/run\/image\/([a-z0-9_]+)$/;
const COMMANDS_RELOAD_PATH = '/internal/commands/reload';
const BLACKLIST_EVENT_PATH = '/internal/blacklist/event';
const PREMIUM_CHECK_PATH = '/internal/premium-check';
const PREMIUM_CHECK_GLOBAL_PATH = '/internal/premium-check/global';
const PREMIUM_CHECK_AI_PATH = '/internal/premium-check/ai';

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function parseCheckerBody(body: any) {
  return {
    accessToken: typeof body?.accessToken === 'string' ? body.accessToken.trim() : '',
    accountId: typeof body?.accountId === 'string' ? body.accountId.trim() : '',
    displayName: typeof body?.displayName === 'string' ? body.displayName.trim() : 'Unknown',
    imageConfig: mergeCheckerImageConfig(body?.imageConfig),
    advancedSettings: body?.advancedSettings ?? {},
    lang: typeof body?.lang === 'string' ? body.lang : 'en',
    runToken: typeof body?.runToken === 'string' ? body.runToken.trim() : '',
  };
}

async function handleCheckerRunText(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_BODY' });
    return;
  }

  const parsed = parseCheckerBody(body);
  if (!parsed.accessToken || !parsed.accountId) {
    sendJson(res, 400, { error: 'accessToken and accountId required', code: 'INVALID_BODY' });
    return;
  }

  try {
    const report = await runCheckerWebTextReport(parsed);
    sendJson(res, 200, report);
  } catch (err: any) {
    if (err?.message === 'PROFILE_UNAVAILABLE') {
      sendJson(res, 502, { error: 'Profile data unavailable', code: 'PROFILE_UNAVAILABLE' });
      return;
    }
    log.bot.error({ err, accountId: parsed.accountId }, '[CheckerAPI] Text report failed');
    sendJson(res, 500, { error: 'Report generation failed', code: 'REPORT_FAILED' });
  }
}

async function handleCheckerRunImage(req: http.IncomingMessage, res: http.ServerResponse, key: string): Promise<void> {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_BODY' });
    return;
  }

  const runToken = typeof body?.runToken === 'string' ? body.runToken.trim() : '';
  if (!runToken) {
    sendJson(res, 400, { error: 'runToken required', code: 'INVALID_BODY' });
    return;
  }

  const run = getCheckerRun(runToken);
  if (!run) {
    sendJson(res, 404, { error: 'Run expired', code: 'RUN_EXPIRED' });
    return;
  }

  try {
    const image = await generateSingleCheckerImageForRun(run, key as CheckerImageKey);
    if (!image) {
      sendJson(res, 204, { skipped: true, key });
      return;
    }
    sendJson(res, 200, image);
  } catch (err: any) {
    log.bot.error({ err, key }, '[CheckerAPI] Image failed');
    sendJson(res, 500, { error: 'Image generation failed', code: 'IMAGE_FAILED' });
  }
}

async function handleCommandsReload(client: ExtendedClient, res: http.ServerResponse): Promise<void> {
  if (!client.isReady()) {
    sendJson(res, 503, { success: false, error: 'Bot not ready', code: 'NOT_READY' });
    return;
  }

  try {
    const result: CommandReloadResult = await reloadCommands(client);
    sendJson(res, result.success ? 200 : 207, { ...result, success: result.success });
  } catch (err) {
    log.commands.error({ err }, '[CommandsAPI] Reload failed');
    sendJson(res, 500, { success: false, error: 'Command reload failed', code: 'RELOAD_FAILED' });
  }
}

function serializeBypassInfo(info: {
  bypassed: boolean;
  source: string | null;
  until: Date | null;
  durationLabel: string | null;
}) {
  return {
    bypassed: info.bypassed,
    source: info.source,
    until: info.until?.toISOString() ?? null,
    durationLabel: info.durationLabel,
    checksEnabled: !info.bypassed,
  };
}

function handlePremiumCheckGet(res: http.ServerResponse): void {
  sendJson(res, 200, {
    success: true,
    global: serializeBypassInfo(getPremiumCheckBypassInfo()),
    ai: serializeBypassInfo(getAiPremiumCheckBypassInfo()),
  });
}

async function handlePremiumCheckSet(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  scope: 'global' | 'ai',
): Promise<void> {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { success: false, error: 'Invalid JSON body', code: 'INVALID_BODY' });
    return;
  }

  const enabled = body?.enabled;
  const duration = typeof body?.duration === 'string' ? body.duration : null;
  const setBy = typeof body?.setBy === 'string' ? body.setBy : 'web-admin';

  if (typeof enabled !== 'boolean') {
    sendJson(res, 400, { success: false, error: 'enabled (boolean) required', code: 'INVALID_BODY' });
    return;
  }

  try {
    if (scope === 'global') {
      if (enabled) {
        await setPremiumCheckBypass(true, null, setBy);
      } else {
        await setPremiumCheckBypass(false, duration, setBy);
      }
      sendJson(res, 200, {
        success: true,
        scope,
        ...serializeBypassInfo(getPremiumCheckBypassInfo()),
      });
      return;
    }

    if (enabled) {
      await setAiPremiumCheckBypass(true, null, setBy);
    } else {
      await setAiPremiumCheckBypass(false, duration, setBy);
    }
    sendJson(res, 200, {
      success: true,
      scope,
      ...serializeBypassInfo(getAiPremiumCheckBypassInfo()),
    });
  } catch (err: any) {
    sendJson(res, 400, {
      success: false,
      error: err?.message ?? 'Invalid request',
      code: 'BYPASS_FAILED',
    });
  }
}

async function handleCheckerRun(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_BODY' });
    return;
  }

  const parsed = parseCheckerBody(body);
  if (!parsed.accessToken || !parsed.accountId) {
    sendJson(res, 400, { error: 'accessToken and accountId required', code: 'INVALID_BODY' });
    return;
  }

  try {
    const report = await runCheckerWebReport(parsed);
    sendJson(res, 200, report);
  } catch (err: any) {
    const message = err?.message ?? String(err);
    if (message === 'PROFILE_UNAVAILABLE') {
      sendJson(res, 502, { error: 'Profile data unavailable', code: 'PROFILE_UNAVAILABLE' });
      return;
    }
    log.bot.error({ err, accountId: parsed.accountId }, '[CheckerAPI] Report failed');
    sendJson(res, 500, { error: 'Report generation failed', code: 'REPORT_FAILED' });
  }
}

export function startAchievementsApi(client: ExtendedClient): void {
  if (server) return;

  const port = parseInt(process.env.GLOW_BOT_API_PORT || '3851', 10);
  const host = process.env.GLOW_BOT_API_HOST || '127.0.0.1';

  if (!isLoopback(host) && host !== 'localhost' && !getSecret()) {
    log.bot.error('[AchievementsAPI] GLOW_BOT_API_HOST no-local requiere GLOW_INTERNAL_API_SECRET — API no iniciada');
    return;
  }

  server = http.createServer(async (req, res) => {
    try {
      const url = (req.url || '/').split('?')[0];

      if (url === '/internal/health') {
        sendJson(res, 200, { status: 'ok', mongo: isMongoConnected(), uptime: process.uptime() });
        return;
      }

      if (url === CHECKER_RUN_TEXT_PATH && req.method === 'POST') {
        if (!isAuthorized(req)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        await handleCheckerRunText(req, res);
        return;
      }

      const imageMatch = url.match(CHECKER_RUN_IMAGE_PATH);
      if (imageMatch && req.method === 'POST') {
        if (!isAuthorized(req)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        await handleCheckerRunImage(req, res, imageMatch[1]);
        return;
      }

      if (url === CHECKER_RUN_PATH && req.method === 'POST') {
        if (!isAuthorized(req)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        await handleCheckerRun(req, res);
        return;
      }

      if (url === BLACKLIST_EVENT_PATH && req.method === 'POST') {
        if (!isAuthorized(req)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        let body: any;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_BODY' });
          return;
        }
        if (body?.action !== 'ban' && body?.action !== 'unban') {
          sendJson(res, 400, { error: 'action required', code: 'INVALID_BODY' });
          return;
        }
        const blacklistEvent = {
          action: body.action,
          discordId: typeof body.discordId === 'string' ? body.discordId : undefined,
          accountCount: Number(body.accountCount) || 0,
          ownerFoundFromAccount: !!body.ownerFoundFromAccount,
          scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [],
          reason: typeof body.reason === 'string' ? body.reason : undefined,
          actor: typeof body.actor === 'string' ? body.actor : 'unknown',
          source: body.source === 'bot' || body.source === 'launcher' ? body.source : 'web',
        };
        invalidateBlacklistGate(blacklistEvent.discordId);
        // Logging and the services' own cache live in Glow Services.
        void callCore('blacklist.event', blacklistEvent).catch((err) => {
          log.bot.warn({ err }, 'Evento de blacklist no entregado a Glow Services');
        });
        sendJson(res, 200, { success: true });
        return;
      }

      if (url === COMMANDS_RELOAD_PATH && req.method === 'POST') {
        if (!isAuthorized(req)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        await handleCommandsReload(client, res);
        return;
      }

      if (url === PREMIUM_CHECK_PATH && req.method === 'GET') {
        if (!isAuthorized(req)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        handlePremiumCheckGet(res);
        return;
      }

      if (url === PREMIUM_CHECK_GLOBAL_PATH && req.method === 'POST') {
        if (!isAuthorized(req)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        await handlePremiumCheckSet(req, res, 'global');
        return;
      }

      if (url === PREMIUM_CHECK_AI_PATH && req.method === 'POST') {
        if (!isAuthorized(req)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        await handlePremiumCheckSet(req, res, 'ai');
        return;
      }

      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      const match = url.match(STATS_PATH);
      if (!match) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }

      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      if (!isMongoConnected()) {
        sendJson(res, 503, { error: 'Database not connected', code: 'DB_OFFLINE' });
        return;
      }

      const discordId = match[1];
      const cached = statsCache.get(discordId);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        sendJson(res, 200, cached.data);
        return;
      }

      const data = await buildUserStats(client, discordId);
      statsCache.set(discordId, { ts: Date.now(), data });

      // Poda simple del cache para no crecer sin límite
      if (statsCache.size > 5000) {
        const cutoff = Date.now() - CACHE_TTL_MS;
        for (const [key, value] of statsCache) {
          if (value.ts < cutoff) statsCache.delete(key);
        }
      }

      sendJson(res, 200, data);
    } catch (err) {
      log.bot.error({ err }, '[AchievementsAPI] Error procesando request');
      sendJson(res, 500, { error: 'Internal error' });
    }
  });

  server.on('error', (err) => {
    log.bot.error({ err }, `[AchievementsAPI] Error de servidor (puerto ${port})`);
    server = null;
  });

  server.listen(port, host, () => {
    log.bot.info(`[AchievementsAPI] Escuchando en http://${host}:${port} (secret: ${getSecret() ? 'sí' : 'no — solo loopback'})`);
  });
}

export function stopAchievementsApi(): void {
  if (!server) return;
  server.close();
  server = null;
  statsCache.clear();
}
