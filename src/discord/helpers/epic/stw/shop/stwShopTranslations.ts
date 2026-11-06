import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SupportedLanguage } from '#helpers/locales/index.ts';

const TRANSLATIONS_DIR = join(process.cwd(), 'src/discord/helpers/data/maps/translations');

const UI_STRINGS = {
  en: {
    title: 'Save The World Store',
    gold: 'Gold',
    eventItems: 'Event Items',
    weeklyItems: 'Weekly Items',
    items: 'items',
    refresh: 'refresh',
    soldOut: 'Sold out',
  },
  es: {
    title: 'Tienda de Save The World',
    gold: 'Oro',
    eventItems: 'Objetos de evento',
    weeklyItems: 'Objetos semanales',
    items: 'objetos',
    refresh: 'actualización',
    soldOut: 'Agotado',
  },
} as const;

const LIMIT_STRINGS = {
  en: { event: 'event', week: 'wk', day: 'day' },
  es: { event: 'evento', week: 'sem', day: 'día' },
} as const;

const cache = new Map<string, Record<string, string>>();

function uiLang(lang: SupportedLanguage): 'en' | 'es' {
  return lang === 'es' ? 'es' : 'en';
}

export function getStwShopUiStrings(lang: SupportedLanguage) {
  return UI_STRINGS[uiLang(lang)];
}

export function getStwSoldOutLabel(lang: SupportedLanguage): string {
  return getStwShopUiStrings(lang).soldOut;
}

export function getStwSectionTitle(sectionKey: string, lang: SupportedLanguage): string {
  const ui = getStwShopUiStrings(lang);
  if (sectionKey === 'event-items') return ui.eventItems;
  if (sectionKey === 'weekly-items') return ui.weeklyItems;
  return sectionKey;
}

export function formatStwLimitLabel(
  offer: { eventLimit: number; weeklyLimit: number; dailyLimit: number },
  lang: SupportedLanguage,
): string {
  const labels = LIMIT_STRINGS[uiLang(lang)];
  const parts: string[] = [];
  if (offer.eventLimit > 0) parts.push(`${offer.eventLimit} ${labels.event}`);
  if (offer.weeklyLimit > 0) parts.push(`${offer.weeklyLimit}/${labels.week}`);
  if (offer.dailyLimit > 0) parts.push(`${offer.dailyLimit}/${labels.day}`);
  return parts.join(' · ');
}

function loadMap(lang: SupportedLanguage): Record<string, string> {
  const file = join(TRANSLATIONS_DIR, `${lang}.json`);
  if (cache.has(file)) return cache.get(file)!;

  const fallbackFile = join(TRANSLATIONS_DIR, 'en.json');
  const pathToLoad = existsSync(file) ? file : fallbackFile;

  if (!existsSync(pathToLoad)) {
    cache.set(file, {});
    return {};
  }

  const raw = readFileSync(pathToLoad, 'utf8').replace(/^\uFEFF/, '');
  const data = JSON.parse(raw) as Record<string, string>;
  cache.set(file, data);
  return data;
}

function isUsableDisplayName(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 72) return false;
  if (/[{[\]|]/.test(value)) return false;
  if (/^assign this /i.test(value)) return false;
  return true;
}

function genericTemplateLabel(templateId: string, lang: SupportedLanguage): string | null {
  const key = templateId.toLowerCase();
  const rarity = key.match(/_(sr|vr|r|uc|c)(?:_|$)/)?.[1] || '';
  const es = lang === 'es';

  if (key.startsWith('worker:workerbasic_')) {
    const labels = es
      ? { sr: 'Sobreviviente legendario', vr: 'Sobreviviente épico', r: 'Sobreviviente raro', uc: 'Sobreviviente poco común', c: 'Sobreviviente común' }
      : { sr: 'Legendary Survivor', vr: 'Epic Survivor', r: 'Rare Survivor', uc: 'Uncommon Survivor', c: 'Common Survivor' };
    return labels[rarity as keyof typeof labels] || null;
  }

  if (key.startsWith('cardpack:cardpack_schematic_')) {
    const tier = key.split('_').pop() || '';
    const labels = es
      ? { sr: 'Plano legendario', vr: 'Plano épico', r: 'Plano raro', uc: 'Plano poco común', c: 'Plano común' }
      : { sr: 'Legendary Schematic', vr: 'Epic Schematic', r: 'Rare Schematic', uc: 'Uncommon Schematic', c: 'Common Schematic' };
    return labels[tier as keyof typeof labels] || null;
  }

  if (key === 'token:accountinventorybonus') return es ? 'Espacio de arsenal' : 'Armory Slot';
  if (key.startsWith('campaignheroloadout:')) return es ? 'Equipo del héroe' : 'Hero Loadout';

  return null;
}

const TRAP_SCHEMATIC_HINTS = [
  'trap', 'wall_', 'floor_', 'ceiling_', 'launch', 'campfire', 'healing', 'teleporter', 'placeable', 'pad_', 'lights_',
];

/**
 * Campaign trap schematics use Schematic:sid_* in profile, but translations are stored as Trap:tid_*.
 * e.g. Schematic:sid_ceiling_electric_aoe_sr_t05 → Trap:tid_ceiling_electric_aoe_sr_t05
 */
export function buildTrapSchematicTranslationAlias(templateId: string): string | null {
  const lower = templateId.toLowerCase();
  if (!lower.startsWith('schematic:sid_')) return null;

  const body = lower.slice('schematic:'.length);
  if (!TRAP_SCHEMATIC_HINTS.some((hint) => body.includes(hint))) return null;

  return `Trap:${body.replace(/^sid_/, 'tid_')}`;
}

function pushMapCandidates(candidates: string[], map: Record<string, string>, key: string): void {
  if (map[key]) candidates.push(map[key]);

  const lower = key.toLowerCase();
  if (map[lower]) candidates.push(map[lower]);

  for (const [mapKey, value] of Object.entries(map)) {
    if (mapKey.toLowerCase() === lower) candidates.push(value);
  }
}

export function lookupStwItemTranslation(
  map: Record<string, string>,
  templateId: string,
): string | null {
  const candidates: string[] = [];
  pushMapCandidates(candidates, map, templateId);

  const trapAlias = buildTrapSchematicTranslationAlias(templateId);
  if (trapAlias) {
    pushMapCandidates(candidates, map, trapAlias);
  }

  const tierMatch = templateId.match(/^([^:]+:.+)_t(\d+)$/i);
  if (tierMatch) {
    const prefix = tierMatch[1].toLowerCase();
    for (const [key, value] of Object.entries(map)) {
      if (key.toLowerCase().startsWith(`${prefix}_t`)) candidates.push(value);
    }
  }

  if (trapAlias) {
    const trapTierMatch = trapAlias.match(/^([^:]+:.+)_t(\d+)$/i);
    if (trapTierMatch) {
      const prefix = trapTierMatch[1].toLowerCase();
      for (const [key, value] of Object.entries(map)) {
        if (key.toLowerCase().startsWith(`${prefix}_t`)) candidates.push(value);
      }
    }
  }

  for (const candidate of candidates) {
    if (isUsableDisplayName(candidate)) return candidate;
  }
  return null;
}

/** True when `translations/{es|en}.json` has a usable name for this templateId. */
export function hasStwItemTranslation(templateId: string, lang: SupportedLanguage): boolean {
  return getStwItemTranslation(templateId, lang) !== null;
}

export function getStwItemTranslation(templateId: string, lang: SupportedLanguage): string | null {
  return lookupStwItemTranslation(loadMap(lang), templateId);
}

export function translateStwItemName(
  templateId: string,
  lang: SupportedLanguage,
  fallbacks: { catalogName?: string; devName?: string } = {},
): string {
  const map = loadMap(lang);
  const translated = lookupStwItemTranslation(map, templateId);
  if (translated) return translated;

  if (lang !== 'en') {
    const enTranslated = lookupStwItemTranslation(loadMap('en'), templateId);
    if (enTranslated) return enTranslated;
  }

  const generic = genericTemplateLabel(templateId, lang);
  if (generic) return generic;

  if (fallbacks.devName && isUsableDisplayName(fallbacks.devName)) return fallbacks.devName.trim();
  if (fallbacks.catalogName && isUsableDisplayName(fallbacks.catalogName)) return fallbacks.catalogName.trim();

  return templateId.replace(/^[^:]+:/, '').replace(/_/g, ' ');
}

/** Translate STW quest keys (e.g. `daily_destroybears`) using maps/translations/{lang}.json */
export function translateStwQuestName(questKey: string, lang: SupportedLanguage): string {
  const normalized = questKey.replace(/^Quest:/i, '').toLowerCase();
  const fullKey = `Quest:${normalized}`;

  const translated = lookupStwItemTranslation(loadMap(lang), fullKey);
  if (translated) return translated;

  if (lang !== 'en') {
    const enFallback = lookupStwItemTranslation(loadMap('en'), fullKey);
    if (enFallback) return enFallback;
  }

  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
