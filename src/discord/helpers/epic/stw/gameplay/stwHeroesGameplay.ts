/**

 * Hero portraits + class abilities from oli heroes.json (HID catalog).

 * Iconos solo locales: heroes/icon, hero-perks/icon, assets/icons/stw.

 */



import {

  loadStwAssetCatalogs,

  resolveStwItemIcon,

  templateToCatalogId,

} from '../shop/stwShopAssets.ts';

import { resolveClassAbilityIcon } from '../loadouts/heroPerksAssets.ts';



export interface OliAbilityRef {

  id: string;

  name: string;

  path?: string;

}



export interface OliHeroGameplay {

  abilities: OliAbilityRef[];

  heroPerk?: OliAbilityRef | null;

  commanderPerk?: OliAbilityRef | null;

}



function catalogMatchToken(id: string): string {

  return id.replace(/_t\d+$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');

}



export function findHeroCatalogEntry(templateId: string): Record<string, any> | null {

  const catalogs = loadStwAssetCatalogs();

  const map = catalogs.heroes;

  if (!map) return null;



  const catalogId = templateToCatalogId(templateId);

  if (map[catalogId]) return map[catalogId];



  const lower = catalogId.toLowerCase();

  for (const [id, item] of Object.entries(map)) {

    if (id.toLowerCase() === lower) return item;

  }



  const target = catalogMatchToken(catalogId);

  for (const [id, item] of Object.entries(map)) {

    if (catalogMatchToken(id) === target) return item;

  }



  return null;

}



/** Retrato local (heroes/icon/HID_*.png). */

export function resolveHeroPortraitForLoadout(templateId: string): string | null {

  return resolveStwItemIcon(templateId);

}



export function getHeroGameplayFromCatalog(templateId: string): OliHeroGameplay | null {

  const entry = findHeroCatalogEntry(templateId);

  const def = entry?.hero_gameplay_definition;

  if (!def) return null;



  return {

    abilities: Array.isArray(def.abilities) ? def.abilities : [],

    heroPerk: def.hero_perk ?? null,

    commanderPerk: def.commander_perk ?? null,

  };

}



export function resolveAbilitiesFromGameplay(

  templateId: string,

  classType: string,

): Array<{ slug: string; name: string; icon: string | null }> {

  const gameplay = getHeroGameplayFromCatalog(templateId);

  if (!gameplay?.abilities.length) return [];



  return gameplay.abilities.map((ab) => ({

    slug: ab.id,

    name: ab.name,

    icon: resolveClassAbilityIcon(ab.id, classType),

  }));

}


