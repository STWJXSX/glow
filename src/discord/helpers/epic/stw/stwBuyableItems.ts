/** STW shop items Glow can buy: keys, labels and emojis (shared by config panels and the core). */
import { translateStwItemName } from './shop/stwShopTranslations.ts';
import { translate } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';

/** Fixed resource items the user can choose to auto-buy */
export const BUYABLE_RESOURCES = [
  'AccountResource:reagent_evolverarity_r',
  'AccountResource:reagent_evolverarity_sr',
  'AccountResource:reagent_evolverarity_vr',
  'AccountResource:reagent_c_t01',
  'AccountResource:reagent_c_t02',
  'AccountResource:reagent_c_t03',
  'AccountResource:reagent_c_t04',
  'AccountResource:reagent_alteration_generic',
  'AccountResource:reagent_alteration_upgrade_uc',
  'AccountResource:reagent_alteration_upgrade_r',
  'AccountResource:reagent_alteration_upgrade_vr',
  'AccountResource:reagent_alteration_upgrade_sr',
  'Worker:workerbasic_vr_t01',
  'Token:accountinventorybonus',
] as const;

/** Dynamic legendary categories: match any legendary of these types */
export const BUYABLE_LEGENDARY_CATEGORIES = [
  'Hero:legendary',
  'Schematic:legendary_weapon',
  'Defender:legendary',
  'Worker:legendary_survivor',
] as const;

export const ALL_BUYABLE_KEYS = [...BUYABLE_RESOURCES, ...BUYABLE_LEGENDARY_CATEGORIES] as const;

// ── Emoji name mapping (matches upload-emojis.js output names) ──

export const ITEM_EMOJI_MAP: Record<string, string> = {
  'AccountResource:reagent_evolverarity_r':     'resources_reagent_evolverarity_r',
  'AccountResource:reagent_evolverarity_sr':    'esources_reagent_evolverarity_sr',
  'AccountResource:reagent_evolverarity_vr':    'esources_reagent_evolverarity_vr',
  'AccountResource:reagent_c_t01':              'resources_reagent_c_t01',
  'AccountResource:reagent_c_t02':              'resources_reagent_c_t02',
  'AccountResource:reagent_c_t03':              'resources_reagent_c_t03',
  'AccountResource:reagent_c_t04':              'resources_reagent_c_t04',
  'AccountResource:reagent_alteration_generic': 'urces_reagent_alteration_generic',
  'AccountResource:reagent_alteration_upgrade_uc': 'es_reagent_alteration_upgrade_uc',
  'AccountResource:reagent_alteration_upgrade_r':  'ces_reagent_alteration_upgrade_r',
  'AccountResource:reagent_alteration_upgrade_vr': 'es_reagent_alteration_upgrade_vr',
  'AccountResource:reagent_alteration_upgrade_sr': 'es_reagent_alteration_upgrade_sr',
  'Worker:workerbasic_vr_t01':                  'ources_voucher_generic_worker_sr',
  'Token:accountinventorybonus':                'resources_eventcurrency_scaling',
  'Hero:legendary':                             'esources_voucher_generic_hero_sr',
  'Schematic:legendary_weapon':                 'ources_voucher_generic_ranged_sr',
  'Defender:legendary':                         'rces_voucher_generic_defender_sr',
  'Worker:legendary_survivor':                  'ources_voucher_generic_worker_sr',
};

export const GOLD_EMOJI_NAME = 'resources_eventcurrency_scaling';

// ── Item labels ─────────────────────────────────────────────

export const ITEM_LABELS: Record<string, { en: string; es: string }> = {
  'AccountResource:reagent_evolverarity_r':     { en: 'Rare Flux', es: 'Flujo raro' },
  'AccountResource:reagent_evolverarity_sr':    { en: 'Legendary Flux', es: 'Flujo legendario' },
  'AccountResource:reagent_evolverarity_vr':    { en: 'Epic Flux', es: 'Flujo épico' },
  'AccountResource:reagent_c_t01':              { en: 'Pure Drop of Rain', es: 'Gota de lluvia pura' },
  'AccountResource:reagent_c_t02':              { en: 'Lightning in a Bottle', es: 'Rayo embotellado' },
  'AccountResource:reagent_c_t03':              { en: 'Eye of the Storm', es: 'Ojo de la tormenta' },
  'AccountResource:reagent_c_t04':              { en: 'Storm Shard', es: 'Fragmento de tormenta' },
  'AccountResource:reagent_alteration_generic': { en: 'RE-PERK!', es: 'RE-PERK!' },
  'AccountResource:reagent_alteration_upgrade_uc': { en: 'Uncommon PERK-UP!', es: 'PERK-UP! Poco común' },
  'AccountResource:reagent_alteration_upgrade_r':  { en: 'Rare PERK-UP!', es: 'PERK-UP! Raro' },
  'AccountResource:reagent_alteration_upgrade_vr': { en: 'Epic PERK-UP!', es: 'PERK-UP! Épico' },
  'AccountResource:reagent_alteration_upgrade_sr': { en: 'Legendary PERK-UP!', es: 'PERK-UP! Legendario' },
  'Worker:workerbasic_vr_t01':                  { en: 'Epic Survivor', es: 'Sobreviviente épico' },
  'Token:accountinventorybonus':                { en: 'Armory Slot', es: 'Espacio de armería' },
  'Hero:legendary':                             { en: 'Legendary Heroes', es: 'Héroes legendarios' },
  'Schematic:legendary_weapon':                 { en: 'Legendary Weapons', es: 'Armas legendarias' },
  'Defender:legendary':                         { en: 'Legendary Defenders', es: 'Defensores legendarios' },
  'Worker:legendary_survivor':                  { en: 'Legendary Survivors', es: 'Sobrevivientes legendarios' },
};

/** Buyable keys whose game-map text is unusable or missing — use autoconfig.stwWizard.items.* */
const BUYABLE_ITEM_LOCALE_SLUGS: Record<string, string> = {
  'Worker:workerbasic_vr_t01': 'epicSurvivor',
  'Hero:legendary': 'legendaryHeroes',
  'Schematic:legendary_weapon': 'legendaryWeapons',
  'Defender:legendary': 'legendaryDefenders',
  'Worker:legendary_survivor': 'legendarySurvivors',
};

/** Human-readable label for STW auto-buy select menus (18 bot languages). */
export function getBuyableItemLabel(buyableKey: string, lang: SupportedLanguage): string {
  const slug = BUYABLE_ITEM_LOCALE_SLUGS[buyableKey];
  if (slug) {
    return translate(`autoconfig.stwWizard.items.${slug}`, lang);
  }

  const translated = translateStwItemName(buyableKey, lang);
  const bareFallback = buyableKey.replace(/^[^:]+:/, '').replace(/_/g, ' ');
  if (translated !== bareFallback) return translated;

  if (lang !== 'en') {
    const enTranslated = translateStwItemName(buyableKey, 'en');
    if (enTranslated !== bareFallback) return enTranslated;
  }

  return ITEM_LABELS[buyableKey]?.en ?? buyableKey;
}

export function getItemDisplayName(templateId: string, lang: SupportedLanguage): string {
  return translateStwItemName(templateId, lang);
}
