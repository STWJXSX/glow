/**
 * STW loadout shared shapes — data already fetched from Epic.
 * The Epic calls live in glow-core; this module is safe to ship publicly.
 */

import { randomUUID } from 'crypto';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import {
  setLoadoutTranslationLang,
  translateHeroNameForLoadout,
  resolveTeamPerkForLoadout,
  resolveGadgetForLoadout,
} from '#helpers/epic/stw/loadouts/stwCatalogLoadout.ts';

export const STW_COMMUNITY_GUILD_ID = '810129117260283915';
export const STW_COMMUNITY_LOADOUTS_CHANNEL_ID = '1509277704338411561';

export interface StwLoadoutSlot {
  guid: string;
  index: number;
  commanderDisplayName: string;
}

export interface StwLoadoutGadgetSnapshot {
  templateId: string;
  slotIndex: number;
}

/** MCP-ready snapshot stored in CommunityLoadout. */
export interface StwLoadoutSnapshot {
  loadoutIndex: number;
  sourceLoadoutGuid: string;
  commanderTemplateId: string;
  commanderLevel: number;
  commanderDisplayName: string;
  teamHeroTemplateIds: string[];
  teamHeroLevels: number[];
  teamHeroDisplayNames: string[];
  teamPerkTemplateId: string;
  teamPerkDisplayName: string;
  gadgets: StwLoadoutGadgetSnapshot[];
  gadgetDisplayNames: string[];
}

export interface CloneLoadoutResult {
  assignments: string[];
  errors: string[];
  targetSlotIndex: number;
}

export function buildLoadoutSlotsFromItems(
  items: Record<string, any>,
  lang: SupportedLanguage = 'en',
): StwLoadoutSlot[] {
  setLoadoutTranslationLang(lang);
  return Object.entries(items)
    .filter(([, v]) => v.templateId?.startsWith('CampaignHeroLoadout:'))
    .sort((a, b) => (a[1].attributes?.loadout_index ?? 0) - (b[1].attributes?.loadout_index ?? 0))
    .map(([guid, item]) => {
      const index = (item.attributes?.loadout_index ?? 0) + 1;
      const cmdGUID: string = item.attributes?.crew_members?.commanderslot ?? '';
      const cmdItem = cmdGUID ? items[cmdGUID] : null;
      const tid: string = cmdItem?.templateId ?? '';
      const name = tid ? translateHeroNameForLoadout(tid, lang) : `Loadout ${index}`;
      return { guid, index, commanderDisplayName: name };
    });
}

export function extractLoadoutSnapshot(
  items: Record<string, any>,
  loadoutGUID: string,
  lang: SupportedLanguage = 'en',
): StwLoadoutSnapshot | null {
  setLoadoutTranslationLang(lang);
  const loadoutItem = items[loadoutGUID];
  if (!loadoutItem?.templateId?.startsWith('CampaignHeroLoadout:')) return null;

  const loadoutIndex = (loadoutItem.attributes?.loadout_index ?? 0) + 1;
  const crew: Record<string, string> = loadoutItem.attributes?.crew_members ?? {};

  const commanderGUID = crew.commanderslot ?? '';
  const commanderItem = commanderGUID ? items[commanderGUID] : null;
  const commanderTid = commanderItem?.templateId ?? '';
  const commanderDisplayName = commanderTid
    ? translateHeroNameForLoadout(commanderTid, lang)
    : '—';

  const teamHeroTemplateIds: string[] = [];
  const teamHeroLevels: number[] = [];
  const teamHeroDisplayNames: string[] = [];

  for (let i = 1; i <= 5; i++) {
    const guid = crew[`followerslot${i}`] ?? '';
    const hero = guid ? items[guid] : null;
    const tid = hero?.templateId ?? '';
    teamHeroTemplateIds.push(tid);
    teamHeroLevels.push(hero?.attributes?.level ?? 1);
    if (tid) {
      teamHeroDisplayNames.push(translateHeroNameForLoadout(tid, lang));
    } else {
      teamHeroDisplayNames.push('—');
    }
  }

  const teamPerkGUID = loadoutItem.attributes?.team_perk ?? '';
  let teamPerkTemplateId = '';
  let teamPerkDisplayName = '—';
  if (teamPerkGUID && items[teamPerkGUID]?.templateId?.startsWith('TeamPerk:')) {
    teamPerkTemplateId = items[teamPerkGUID].templateId as string;
    teamPerkDisplayName = resolveTeamPerkForLoadout(teamPerkTemplateId, lang).name;
  }

  const gadgets: StwLoadoutGadgetSnapshot[] = ((loadoutItem.attributes?.gadgets as any[]) ?? [])
    .map((g: any) => ({
      templateId: g.gadget as string,
      slotIndex: g.slot_index as number,
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex);

  const gadgetDisplayNames = gadgets.map((g) => resolveGadgetForLoadout(g.templateId, lang).name);

  return {
    loadoutIndex,
    sourceLoadoutGuid: loadoutGUID,
    commanderTemplateId: commanderTid,
    commanderLevel: commanderItem?.attributes?.level ?? 1,
    commanderDisplayName,
    teamHeroTemplateIds,
    teamHeroLevels,
    teamHeroDisplayNames,
    teamPerkTemplateId,
    teamPerkDisplayName,
    gadgets,
    gadgetDisplayNames,
  };
}

export function newCommunityPublicId(): string {
  return randomUUID();
}
