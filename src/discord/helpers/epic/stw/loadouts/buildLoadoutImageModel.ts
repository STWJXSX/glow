import { fileToDataUrl } from '../shop/stwShopAssets.ts';
import type { LoadoutRenderData, LoadoutHeroSlot } from './parseLoadoutData.ts';
import { getCommanderPower } from './parseLoadoutData.ts';
import { getHeroPower, getHeroStarCount, rarityCssClass } from './stwCatalogLoadout.ts';
import { getLoadoutPanelUi, type LoadoutPanelUi } from './stwLoadoutPanelI18n.ts';



export interface LoadoutImageIconSlot {

  name: string;

  src: string;

}



export interface LoadoutImageSupportSlot {

  name: string;

  level: number;

  power: number;

  rarityClass: string;

  portraitSrc: string;

  heroPerk: LoadoutImageIconSlot | null;

}



export interface LoadoutImageModel {
  ui: LoadoutPanelUi;

  commander: {

    name: string;

    power: number;

    stars: number;

    rarityLabel: string;

    classLabel: string;

    rarityClass: string;

    portraitSrc: string;

    abilities: LoadoutImageIconSlot[];

    commanderPerk: LoadoutImageIconSlot | null;

  } | null;

  teamPerk: LoadoutImageIconSlot | null;

  support: LoadoutImageSupportSlot[];

  gadgets: LoadoutImageIconSlot[];

}



function iconSrc(filePath: string | null, fallbackLabel: string): string {

  if (filePath?.startsWith('http://') || filePath?.startsWith('https://')) {

    return placeholderIcon(fallbackLabel);

  }

  return fileToDataUrl(filePath) ?? placeholderIcon(fallbackLabel);

}



function placeholderIcon(label: string): string {

  const text = label.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">

    <rect width="128" height="128" rx="14" fill="#51616b"/>

    <text x="64" y="78" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="42" fill="#fff">${text}</text>

  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

}



function mapAbilities(hero: LoadoutHeroSlot): LoadoutImageIconSlot[] {
  return hero.perks.abilities
    .filter((a) => a.icon || (a.name && a.name.trim()))
    .slice(0, 3)
    .map((a, i) => ({
      name: a.name || `Ability ${i + 1}`,
      src: iconSrc(a.icon, a.name || a.slug || '?'),
    }));
}



function mapSupport(hero: LoadoutHeroSlot): LoadoutImageSupportSlot {
  const perkName = hero.perks.supportPerkName?.trim() ?? '';
  return {
    name: hero.info.displayName,
    level: hero.level,
    power: getHeroPower(hero.info.rarity, hero.level),
    rarityClass: rarityCssClass(hero.info.rarity),
    portraitSrc: iconSrc(hero.portraitPath, hero.info.displayName),
    heroPerk: perkName
      ? {
          name: perkName,
          src: iconSrc(hero.perks.supportPerkIcon, perkName),
        }
      : null,
  };
}



export function buildLoadoutImageModel(data: LoadoutRenderData): LoadoutImageModel {
  const ui = getLoadoutPanelUi(data.lang);

  let commander: LoadoutImageModel['commander'] = null;

  if (data.commander) {

    const c = data.commander;

    commander = {

      name: c.info.displayName,

      power: getCommanderPower(c),

      stars: getHeroStarCount(c.info),

      rarityLabel: c.info.rarityDisplay,

      classLabel: c.info.classLabel,

      rarityClass: rarityCssClass(c.info.rarity),

      portraitSrc: iconSrc(c.portraitPath, c.info.displayName),

      abilities: mapAbilities(c),

      commanderPerk: c.perks.commanderPerkName
        ? {
            name: c.perks.commanderPerkName,
            src: iconSrc(c.perks.commanderPerkIcon, c.perks.commanderPerkName),
          }
        : null,

    };

  }



  const teamPerk = data.teamPerk

    ? {

        name: data.teamPerk.name,

        src: iconSrc(data.teamPerk.iconPath, data.teamPerk.name),

      }

    : null;



  return {
    ui,
    commander,
    teamPerk,
    support: data.supportTeam.map(mapSupport),
    gadgets: data.gadgets.map((g) => ({
      name: g.name,
      src: iconSrc(g.iconPath, g.name),
    })),
  };
}


