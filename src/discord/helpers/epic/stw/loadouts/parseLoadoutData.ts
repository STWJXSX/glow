import type { SupportedLanguage } from '#helpers/locales/index.ts';
import {
  setLoadoutTranslationLang,
  translateHeroNameForLoadout,
  parseHeroInfoForLoadout,
  resolveHeroPerksForLoadout,
  resolveTeamPerkForLoadout,
  resolveGadgetForLoadout,
  catalogHeroPortraitPath,
  getHeroPower,
  type HeroInfo,
  type ResolvedLoadoutPerks,
} from './stwCatalogLoadout.ts';

export type { HeroInfo, ResolvedLoadoutPerks };

export interface LoadoutHeroSlot {
  templateId: string;
  level: number;
  info: HeroInfo;
  portraitPath: string | null;
  perks: ResolvedLoadoutPerks;
}

export interface LoadoutGadgetSlot {
  templateId: string;
  name: string;
  iconPath: string | null;
  slotIndex: number;
}

export interface LoadoutRenderData {
  lang: SupportedLanguage;
  loadoutIndex: number;
  commander: LoadoutHeroSlot | null;
  supportTeam: LoadoutHeroSlot[];
  teamPerk: { templateId: string; name: string; iconPath: string | null; matched: number; required: number } | null;
  gadgets: LoadoutGadgetSlot[];
}

export function parseLoadoutFromItems(
  items: Record<string, any>,
  loadoutGUID: string,
  lang: SupportedLanguage = 'en',
): LoadoutRenderData | null {
  setLoadoutTranslationLang(lang);

  const loadoutItem = items[loadoutGUID];
  if (!loadoutItem?.templateId?.startsWith('CampaignHeroLoadout:')) return null;

  const loadoutIndex = (loadoutItem.attributes?.loadout_index ?? 0) + 1;
  const crew: Record<string, string> = loadoutItem.attributes?.crew_members ?? {};

  const buildHero = (guid: string, asCommander: boolean): LoadoutHeroSlot | null => {
    const item = items[guid];
    if (!item?.templateId?.startsWith('Hero:')) return null;
    const tid = item.templateId as string;
    const displayName = translateHeroNameForLoadout(tid, lang);
    const info = parseHeroInfoForLoadout(tid, displayName, lang);
    return {
      templateId: tid,
      level: item.attributes?.level ?? 1,
      info,
      portraitPath: catalogHeroPortraitPath(tid),
      perks: resolveHeroPerksForLoadout(tid, asCommander, lang),
    };
  };

  const commanderGuid = crew.commanderslot ?? '';
  const commander = commanderGuid ? buildHero(commanderGuid, true) : null;

  const supportTeam: LoadoutHeroSlot[] = [];
  for (let i = 1; i <= 5; i++) {
    const guid = crew[`followerslot${i}`] ?? '';
    if (guid) {
      const hero = buildHero(guid, false);
      if (hero) supportTeam.push(hero);
    }
  }

  let teamPerk: LoadoutRenderData['teamPerk'] = null;
  const teamPerkGUID: string = loadoutItem.attributes?.team_perk ?? '';
  if (teamPerkGUID && items[teamPerkGUID]) {
    const tpTid = items[teamPerkGUID].templateId ?? '';
    if (tpTid.startsWith('TeamPerk:')) {
      const resolved = resolveTeamPerkForLoadout(tpTid, lang);
      teamPerk = {
        templateId: tpTid,
        name: resolved.name,
        iconPath: resolved.iconPath,
        matched: supportTeam.length,
        required: 3,
      };
    }
  }

  const gadgets: LoadoutGadgetSlot[] = ((loadoutItem.attributes?.gadgets as any[]) ?? [])
    .map((g: any) => ({
      templateId: g.gadget as string,
      slotIndex: g.slot_index as number,
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((g) => {
      const resolved = resolveGadgetForLoadout(g.templateId, lang);
      return {
        templateId: g.templateId,
        slotIndex: g.slotIndex,
        name: resolved.name,
        iconPath: resolved.iconPath,
      };
    });

  return { lang, loadoutIndex, commander, supportTeam, teamPerk, gadgets };
}

export function getCommanderPower(commander: LoadoutHeroSlot | null): number {
  if (!commander) return 0;
  return getHeroPower(commander.info.rarity, commander.level);
}
