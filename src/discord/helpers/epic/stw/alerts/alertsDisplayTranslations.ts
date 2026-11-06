import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { translate } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import { FALLBACK_LANGUAGE } from '#helpers/locales/languages.ts';
import type { ProcessedMission } from './alertsHelper.ts';

const TRANSLATIONS_DIR = join(process.cwd(), 'src/discord/helpers/data/maps/translations');

const ZONE_TO_LOCALE_KEY: Record<string, string> = {
  'V-Bucks': 'alerts.zones.vbucks',
  Stonewood: 'alerts.zones.stonewood',
  Plankerton: 'alerts.zones.plankerton',
  'Canny Valley': 'alerts.zones.canny',
  'Twine Peaks': 'alerts.zones.twine',
  Ventures: 'alerts.zones.ventures',
  Events: 'alerts.zones.events',
};

const ZONE_GAME_KEYS: Record<string, string> = {
  Stonewood: 'Expedition:expedition_resourcerun_woodstone_medium',
  Plankerton: 'Quest:endurancewave30theater02',
  'Canny Valley': 'Quest:endurancewave30theater03',
  'Twine Peaks': 'Quest:endurancewave30theater04',
};

/** Short zone tag for images / UI — launcher home style, not endurance locale strings. */
const ZONE_SHORT_LABELS: Record<string, string> = {
  Stonewood: 'Stonewood',
  Plankerton: 'Plankerton',
  'Canny Valley': 'Canny',
  'Twine Peaks': 'Twine',
  Ventures: 'Ventures',
  Events: 'Events',
  'Events or Campaign': 'Events',
  'V-Bucks': 'V-Bucks',
};

export function formatAlertsZoneShortLabel(zone: string): string {
  return ZONE_SHORT_LABELS[zone] ?? zone;
}

const cache = new Map<string, Record<string, string>>();

function loadGameMap(lang: SupportedLanguage): Record<string, string> {
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

function parseZoneNameFromEndurance(text: string, fallback: string): string {
  if (!text) return fallback;

  const dashSplit = text.split(/\s*[-–—]\s*/);
  if (dashSplit.length >= 2) {
    const tail = dashSplit[dashSplit.length - 1].trim();
    if (tail && !/endurance|ausdauer|defensa|defensive|耐久|verteidigung/i.test(tail)) {
      return tail.replace(/[:\s]+$/g, '').trim();
    }
  }

  const enduranceIdx = text.search(/\b(endurance|ausdauer|defensa|defensive|耐久|verteidigung)\b/i);
  if (enduranceIdx > 0) {
    return text.slice(0, enduranceIdx).trim();
  }

  const hyphen = text.split('-')[0]?.trim();
  if (hyphen && hyphen.length < text.length && hyphen.length <= 24) {
    return hyphen;
  }

  const colon = text.split(':')[0]?.trim();
  if (colon && colon.length < text.length && colon.length <= 24) {
    return colon;
  }

  return text.trim() || fallback;
}

function lookupGameTranslation(map: Record<string, string>, key: string): string | null {
  const hit = map[key];
  return hit && hit !== key ? hit : null;
}

function findMissionGenKeyByEnglishName(map: Record<string, string>, englishName: string): string | undefined {
  const lower = englishName.toLowerCase();
  for (const [key, value] of Object.entries(map)) {
    if (!key.startsWith('MissionGen_')) continue;
    if (value.toLowerCase() === lower) return key;
  }
  return undefined;
}

export function translateAlertsMissionName(mission: ProcessedMission, lang: SupportedLanguage): string {
  const map = loadGameMap(lang);
  const enMap = lang === FALLBACK_LANGUAGE ? map : loadGameMap(FALLBACK_LANGUAGE);

  const genKey = mission.missionGenKey
    || findMissionGenKeyByEnglishName(enMap, mission.missionName);

  if (genKey) {
    const translated = lookupGameTranslation(map, genKey);
    if (translated) return translated;
  }

  return mission.missionName;
}

export function translateAlertsZone(zone: string, lang: SupportedLanguage): string {
  const localeKey = ZONE_TO_LOCALE_KEY[zone];
  if (localeKey) {
    const fromLocale = translate(localeKey, lang);
    if (fromLocale !== localeKey) return fromLocale;
  }

  const gameKey = ZONE_GAME_KEYS[zone];
  if (gameKey) {
    const map = loadGameMap(lang);
    const raw = lookupGameTranslation(map, gameKey);
    if (raw) {
      if (gameKey.startsWith('Expedition:')) return raw;
      return parseZoneNameFromEndurance(raw, zone);
    }
  }

  return zone;
}

export function translateAlertsModifierName(modifierKey: string, displayName: string, lang: SupportedLanguage): string {
  if (!modifierKey && !displayName) return displayName;

  const map = loadGameMap(lang);
  const candidates = [
    modifierKey.startsWith('GameplayModifier:') ? modifierKey : `GameplayModifier:${modifierKey}`,
    modifierKey,
    `GameplayModifier:${displayName}`,
  ];

  for (const candidate of candidates) {
    const hit = lookupGameTranslation(map, candidate);
    if (hit) return hit;
  }

  return displayName;
}
