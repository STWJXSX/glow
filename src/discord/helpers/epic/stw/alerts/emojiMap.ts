import { readFileSync, existsSync } from 'fs';
import { basename, extname, join, normalize, sep } from 'path';
import { log } from '#helpers/core/logger.ts';

/**
 * Application emoji system for STW alerts.
 * Loads emojis-export.json (array of {id, name, animated, uso_en_mensaje})
 * from helpers/data/emojis/ (canonical) and provides lookup by emoji name.
 */

interface EmojiEntry {
  id: string;
  name: string;
  animated: boolean;
  uso_en_mensaje: string;
}

let EMOJI_MAP: Map<string, EmojiEntry> = new Map();
let EMOJI_BY_ID: Map<string, EmojiEntry> = new Map();
const missingEmojiWarned = new Set<string>();

function resolveEmojiExportPath(): string | null {
  const candidates = [
    join((import.meta.dirname ?? __dirname), '..', 'data', 'emojis', 'emojis-export.json'),
    join((import.meta.dirname ?? __dirname), '..', '..', 'data', 'emojis-export.json'),
    join(process.cwd(), 'src/discord/helpers/data/emojis/emojis-export.json'),
    join(process.cwd(), 'apps/bots/glow/src/discord/helpers/data/emojis/emojis-export.json'),
    join(process.cwd(), 'scripts', 'emojis', 'emojis-export.json'),
    join(process.cwd(), 'scripts', 'emojis-export.json'),
    join((import.meta.dirname ?? __dirname), '..', '..', '..', '..', 'scripts', 'emojis', 'emojis-export.json'),
    join((import.meta.dirname ?? __dirname), '..', '..', '..', '..', 'scripts', 'emojis-export.json'),
    join((import.meta.dirname ?? __dirname), '..', '..', '..', 'scripts', 'emojis', 'emojis-export.json'),
    join((import.meta.dirname ?? __dirname), '..', '..', '..', 'scripts', 'emojis-export.json'),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function loadEmojiExport(): void {
  try {
    const exportPath = resolveEmojiExportPath();
    if (!exportPath) {
      log.bot.warn('emojis-export.json not found — alert emojis will use text fallbacks');
      return;
    }
    const raw = readFileSync(exportPath, 'utf-8');
    const arr: EmojiEntry[] = JSON.parse(raw);
    EMOJI_MAP = new Map(arr.map((entry) => [entry.name, entry]));
    EMOJI_BY_ID = new Map(arr.map((entry) => [entry.id, entry]));
    log.bot.info({ count: EMOJI_MAP.size, path: exportPath }, 'Application emojis loaded');
  } catch (err) {
    log.bot.warn({ err }, 'Failed to load emojis-export.json');
  }
}

loadEmojiExport();

/** Gadget slug (g_*) → Discord emoji string (scripts/emojis/gadget-emoji-map.json). */
let GADGET_DISCORD: Record<string, string> = {};
try {
  const gadgetJson = join(process.cwd(), 'scripts/emojis/gadget-emoji-map.json');
  if (existsSync(gadgetJson)) {
    const parsed = JSON.parse(readFileSync(gadgetJson, 'utf-8')) as {
      mapped?: Array<{ slug: string; uso_en_mensaje: string }>;
    };
    for (const row of parsed.mapped ?? []) {
      if (!row.slug || !row.uso_en_mensaje) continue;
      const key = row.slug.startsWith('g_') ? row.slug : `g_${row.slug}`;
      GADGET_DISCORD[key] = row.uso_en_mensaje;
    }
    log.bot.info({ count: Object.keys(GADGET_DISCORD).length }, 'Gadget Discord emojis loaded');
  }
} catch (err) {
  log.bot.warn({ err }, 'gadget-emoji-map.json not loaded');
}

function sanitizeSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/**
 * Get emoji string by exact uploaded name.
 * Returns `<:name:id>` (or `<a:name:id>` for animated) if found, else fallback.
 */
export function e(name: string, fallback = ''): string {
  const entry = EMOJI_MAP.get(name);
  if (!entry) {
    if (!missingEmojiWarned.has(name)) {
      missingEmojiWarned.add(name);
      log.commands.warn({ name, exportLoaded: EMOJI_MAP.size > 0 }, '[emojiMap] emoji not found in export');
    }
    return fallback;
  }
  return entry.uso_en_mensaje;
}

/** Lookup by Discord emoji id — stable when export name differs from live app name. */
export function eByDiscordId(id: string, fallback = ''): string {
  const entry = EMOJI_BY_ID.get(id);
  if (!entry) return fallback;
  return entry.uso_en_mensaje;
}

/**
 * Search for an emoji whose name ends with `suffix`.
 * Useful for truncated names (upload script truncates to 32 chars from the right).
 */
export function eSuffix(suffix: string, fallback = ''): string {
  const lower = suffix.toLowerCase();
  for (const [name, entry] of EMOJI_MAP) {
    if (name.endsWith(lower) || name === lower) return entry.uso_en_mensaje;
  }
  return fallback;
}

/** Discord emoji for STW gadget templateId (Gadget:g_* or g_*). */
export function eGadget(templateId: string, fallback = ''): string {
  const slug = templateId.replace(/^Gadget:/i, '').replace(/^g_/i, 'g_');
  const key = slug.startsWith('g_') ? slug : `g_${slug}`;
  return GADGET_DISCORD[key] ?? fallback;
}

/**
 * Resolve an uploaded emoji from a source asset path.
 * Uses the same filename/folder suffixes preserved by the upload script.
 */
export function eAsset(filePath: string | null | undefined, fallback = ''): string {
  if (!filePath) return fallback;

  const normalizedPath = normalize(filePath);
  const fileName = sanitizeSegment(basename(normalizedPath, extname(normalizedPath)));
  const folderSegments = normalizedPath
    .split(sep)
    .filter(Boolean)
    .slice(-4, -1)
    .map(sanitizeSegment)
    .filter(Boolean);

  const candidates = new Set<string>();
  const allSegments = [...folderSegments, fileName].filter(Boolean);

  for (let depth = 1; depth <= allSegments.length; depth++) {
    const combined = allSegments
      .slice(Math.max(0, allSegments.length - depth))
      .join('_')
      .replace(/^_+/, '');

    if (!combined) continue;
    candidates.add(combined);

    const trimmed = combined.length > 32 ? combined.slice(-32).replace(/^_+/, '') : combined;
    if (trimmed) candidates.add(trimmed);
  }

  for (const candidate of candidates) {
    const exact = e(candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const suffix = eSuffix(candidate);
    if (suffix) return suffix;
  }

  return fallback;
}
