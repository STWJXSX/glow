import { translateStwItemName, translateStwQuestName } from '../epic/stw/shop/stwShopTranslations.ts';
import type { SupportedLanguage } from './languages.ts';

/**
 * Game name translations (heroes, expeditions, items, quests) via
 * helpers/data/maps/translations/{lang}.json (all 18 bot languages).
 */

export function translateGameName(templateId: string, lang: SupportedLanguage = 'en'): string {
  if (!templateId || typeof templateId !== 'string') return templateId || 'Unknown';
  return translateStwItemName(templateId, lang);
}

export function translateExpeditionName(templateId: string, lang: SupportedLanguage = 'en'): string {
  const translated = translateStwItemName(templateId, lang);
  if (translated !== templateId.replace(/^[^:]+:/, '').replace(/_/g, ' ')) return translated;

  return templateId
    .replace('Expedition:expedition_', '')
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function translateHeroName(templateId: string, lang: SupportedLanguage = 'en'): string {
  const translated = translateStwItemName(templateId, lang);
  const bare = templateId.replace(/^[^:]+:/, '').replace(/_/g, ' ');
  if (translated !== bare) return translated;

  return templateId
    .replace('Worker:', '')
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function translateItemName(templateId: string, lang: SupportedLanguage = 'en'): string {
  return translateStwItemName(templateId, lang);
}

export function translateQuestName(questKey: string, lang: SupportedLanguage = 'en'): string {
  return translateStwQuestName(questKey, lang);
}
