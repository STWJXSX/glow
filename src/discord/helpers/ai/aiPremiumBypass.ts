import { log } from '../core/logger.ts';
import GlowAiPremiumCheckState from '#models/premium/GlowAiPremiumCheckState.ts';
import { parsePremiumCheckDuration } from '../core/client/premium.ts';

/**
 * DB-backed AI-only premium bypass (conversation memory + in-AI Epic systems).
 *
 * Toggle via `/premium-admin aipremiumcheck` or web admin → Premium Bypass → AI.
 *
 * Does NOT affect: slash-command premium gates, /ai model profiles, Ultimate ai_image.
 */

interface AiPremiumCheckCache {
  checksDisabled: boolean;
  bypassUntil: number | null;
  durationLabel: string | null;
}

const DEFAULT_CACHE: AiPremiumCheckCache = {
  checksDisabled: false,
  bypassUntil: null,
  durationLabel: null,
};

let aiPremiumCheckCache: AiPremiumCheckCache = { ...DEFAULT_CACHE };

export interface AiPremiumCheckBypassInfo {
  bypassed: boolean;
  source: 'database' | null;
  until: Date | null;
  durationLabel: string | null;
}

function applyCacheFromDoc(doc: {
  checksEnabled: boolean;
  bypassUntil: Date | null;
  durationLabel: string | null;
}): void {
  if (doc.checksEnabled) {
    aiPremiumCheckCache = {
      checksDisabled: false,
      bypassUntil: null,
      durationLabel: null,
    };
    return;
  }

  aiPremiumCheckCache = {
    checksDisabled: true,
    bypassUntil: doc.bypassUntil?.getTime() ?? null,
    durationLabel: doc.durationLabel,
  };
}

/** Load AI bypass state from MongoDB (call on bot ready). */
export async function loadAiPremiumCheckState(): Promise<void> {
  try {
    let doc = await GlowAiPremiumCheckState.findOne({ key: 'global' });
    if (!doc) {
      aiPremiumCheckCache = { ...DEFAULT_CACHE };
      return;
    }

    if (!doc.checksEnabled && doc.bypassUntil && doc.bypassUntil.getTime() <= Date.now()) {
      doc.checksEnabled = true;
      doc.bypassUntil = null;
      doc.durationLabel = null;
      await doc.save();
    }

    applyCacheFromDoc(doc);
    log.bot.info(
      {
        checksDisabled: aiPremiumCheckCache.checksDisabled,
        until: aiPremiumCheckCache.bypassUntil,
        duration: aiPremiumCheckCache.durationLabel,
      },
      '[AI] AI premium check state loaded from DB',
    );
  } catch (error) {
    log.database.error({ error }, '[AI] Failed to load AI premium check state — checks enabled by default');
    aiPremiumCheckCache = { ...DEFAULT_CACHE };
  }
}

export function isAiPremiumBypassActive(now = Date.now()): boolean {
  if (!aiPremiumCheckCache.checksDisabled) return false;
  if (aiPremiumCheckCache.bypassUntil === null) return true;
  return now < aiPremiumCheckCache.bypassUntil;
}

export function getAiPremiumCheckBypassInfo(): AiPremiumCheckBypassInfo {
  if (!aiPremiumCheckCache.checksDisabled) {
    return { bypassed: false, source: null, until: null, durationLabel: null };
  }

  if (aiPremiumCheckCache.bypassUntil !== null && Date.now() >= aiPremiumCheckCache.bypassUntil) {
    return { bypassed: false, source: null, until: null, durationLabel: null };
  }

  return {
    bypassed: true,
    source: 'database',
    until: aiPremiumCheckCache.bypassUntil ? new Date(aiPremiumCheckCache.bypassUntil) : null,
    durationLabel: aiPremiumCheckCache.durationLabel,
  };
}

/**
 * Enable/disable AI premium gates (persisted in DB).
 * duration examples: 4h, 2d, 1w, 3m — omit for indefinite bypass.
 */
export async function setAiPremiumCheckBypass(
  enabled: boolean,
  duration?: string | null,
  setBy?: string | null,
): Promise<void> {
  if (enabled) {
    const doc = await GlowAiPremiumCheckState.findOneAndUpdate(
      { key: 'global' },
      {
        checksEnabled: true,
        bypassUntil: null,
        durationLabel: null,
        updatedBy: setBy ?? null,
        updatedAt: new Date(),
      },
      { upsert: true, new: true },
    );
    applyCacheFromDoc(doc!);
    return;
  }

  let bypassUntil: Date | null = null;
  let durationLabel: string | null = null;

  if (duration?.trim()) {
    const ms = parsePremiumCheckDuration(duration);
    if (ms === null) {
      throw new Error('Invalid duration. Use: 4h, 2d, 1w, 3m (hours, days, weeks, months).');
    }
    bypassUntil = new Date(Date.now() + ms);
    durationLabel = duration.trim().toLowerCase();
  }

  const doc = await GlowAiPremiumCheckState.findOneAndUpdate(
    { key: 'global' },
    {
      checksEnabled: false,
      bypassUntil,
      durationLabel,
      updatedBy: setBy ?? null,
      updatedAt: new Date(),
    },
    { upsert: true, new: true },
  );
  applyCacheFromDoc(doc!);
}

/** Re-enable AI checks when timed bypass expires. Returns true if it just expired. */
export async function checkAiBypassJustExpired(): Promise<boolean> {
  if (!aiPremiumCheckCache.checksDisabled) return false;
  if (aiPremiumCheckCache.bypassUntil === null) return false;
  if (Date.now() < aiPremiumCheckCache.bypassUntil) return false;

  await setAiPremiumCheckBypass(true, null, null);
  return true;
}

export function logAiPremiumBypassState(): void {
  const info = getAiPremiumCheckBypassInfo();
  if (!info.bypassed) {
    log.bot.info('[AI] AI premium memory/systems bypass: OFF');
    return;
  }

  log.bot.info(
    { until: info.until, duration: info.durationLabel },
    '[AI] AI premium memory/systems bypass: ON — free users get conversation history + in-AI Epic systems',
  );
}
