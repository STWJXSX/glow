/**
 * STW Mission Alerts Helper
 * Fetches world info from Epic Games API and processes missions
 * with zone detection, reward parsing, and modifier extraction.
 *
 * Adapted from GLOW Launcher's alerts.ts for the Discord bot.
 */

import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { log } from '#helpers/core/logger.ts';
import { translateGameName } from '#helpers/locales/gameTranslations.ts';
import { e, eByDiscordId, eSuffix } from './emojiMap.ts';

// ── Types ──────────────────────────────────────────────────

export interface AlertRewardItem {
  itemType: string;
  quantity: number;
  name: string;
  emoji: string;
}

export interface AlertModifier {
  name: string;
  emoji: string;
  itemType?: string;
}

export interface ProcessedMission {
  id: string;
  theaterId: string;
  tileIndex: number;
  power: number;
  zone: string;
  zoneGeo: string;
  missionName: string;
  missionGenKey?: string;
  missionEmoji: string;
  alerts: AlertRewardItem[];
  rewards: AlertRewardItem[];
  modifiers: AlertModifier[];
  hasAlerts: boolean;
}

export interface ZoneMissions {
  zone: string;
  missions: ProcessedMission[];
}

// ── World info cache (per UTC day) ─────────────────────────

let _cachedResult: ZoneMissions[] | null = null;
let _cachedUTCDate: string | null = null;

function getUTCDateKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

// ── Translation ────────────────────────────────────────────

function traducir(key: string): string {
  if (!key) return '';
  // Try en-US first (acts as guia.json equivalent)
  const enName = translateGameName(key, 'en');
  if (enName !== key) return enName;
  // Then es-ES
  const esName = translateGameName(key, 'es');
  if (esName !== key) return esName;

  // Strip common prefixes as fallback
  if (key.startsWith('CardPack:')) return key.replace('CardPack:', '');
  if (key.startsWith('AccountResource:')) return key.replace('AccountResource:', '');
  if (key.startsWith('Alteration:')) return key.replace('Alteration:', '');
  if (key.startsWith('Token:')) return key.replace('Token:', '');
  if (key.startsWith('Quest:')) return key.replace('Quest:', '');
  return key;
}

// ── Mission name detection ─────────────────────────────────

const MISSION_PATTERNS: { patterns: string[]; name: string; emojiName: string; genKey?: string }[] = [
  { patterns: ['RtL', 'LtB', 'RideTheLightning', 'LaunchTheBalloon'], name: 'Ride the Lightning', emojiName: 'world_rtl', genKey: 'MissionGen_T3_R5_RtL' },
  { patterns: ['RtD', 'RetrieveTheData'], name: 'Retrieve the Data', emojiName: 'world_rtd', genKey: 'MissionGen_T3_R5_RtD' },
  { patterns: ['DtB'], name: 'Deliver the Bomb', emojiName: 'world_dtb', genKey: 'MissionGen_T3_R5_DtB' },
  { patterns: ['1Gate', '1Gates', 'Cat1FtS'], name: 'Fight the Storm', emojiName: 'world_atlas', genKey: 'MissionGen_T3_R5_1Gate' },
  { patterns: ['2Gates'], name: 'Fight Category 2 Storm', emojiName: 'world_atlas_c2', genKey: 'MissionGen_T3_R5_2Gates' },
  { patterns: ['3Gates'], name: 'Fight Category 3 Storm', emojiName: 'world_atlas_c3', genKey: 'MissionGen_T3_R5_3Gates' },
  { patterns: ['4Gates'], name: 'Fight Category 4 Storm', emojiName: 'world_atlas_c4', genKey: 'MissionGen_T3_R5_4Gates' },
  { patterns: ['DtE', 'DestroyTheEncampments'], name: 'Destroy the Encampments', emojiName: 'world_dte', genKey: 'MissionGen_T3_R5_DtE' },
  { patterns: ['BuildtheRadarGrid'], name: 'Build the Radar Grid', emojiName: 'world_radar', genKey: 'MissionGen_T3_R5_BuildtheRadarGrid' },
  { patterns: ['Resupply'], name: 'Resupply', emojiName: 'world_resupply', genKey: 'MissionGen_Resupply' },
  { patterns: ['EliminateAndCollect'], name: 'Eliminate and Collect', emojiName: 'world_eac', genKey: 'MissionGen_EliminateAndCollect' },
  { patterns: ['RtS'], name: 'Repair the Shelter', emojiName: 'world_rts', genKey: 'MissionGen_T3_R5_RtS' },
  { patterns: ['EtShelter', 'EtS_C'], name: 'Evacuate the Shelter', emojiName: 'world_ets', genKey: 'MissionGen_T3_R5_EtShelter' },
  { patterns: ['EtSurvivors', 'EvacuateTheSurvivors'], name: 'Rescue the Survivors', emojiName: 'world_rescue', genKey: 'MissionGen_T3_R5_EtSurvivors' },
  { patterns: ['RefuelTheBase'], name: 'Refuel the Homebase', emojiName: 'world_refuel', genKey: 'MissionGen_RefuelTheBase' },
  { patterns: ['LtR'], name: 'Launch the Rocket', emojiName: 'world_rocket', genKey: 'MissionGen_LtR_Twine' },
  { patterns: ['HTM'], name: 'Hunt the Titan', emojiName: 'world_htm' },
  { patterns: ['PvE'], name: 'Storm Shield Defense', emojiName: 'world_storm_shield' },
  { patterns: ['StabilizeTheRift'], name: 'Stabilize the Rift', emojiName: 'world_quest', genKey: 'MissionGen_StabilizeTheRift' },
  { patterns: ['Mayday'], name: 'Hit the Road', emojiName: 'world_htr', genKey: 'MissionGen_HitTheRoad' },
  { patterns: ['FightTheGunslinger'], name: 'Fight the Gunslinger', emojiName: 'world_quest', genKey: 'MissionGen_FightTheGunslinger' },
];

function parseMission(mission: any): { name: string; emoji: string; emojiName: string; genKey?: string } {
  const raw: string =
    mission.missionGenerator ||
    mission.missionRewards?.tierGroupName ||
    mission.missionGuid ||
    mission.missionName ||
    '';

  if (raw) {
    for (const m of MISSION_PATTERNS) {
      for (const p of m.patterns) {
        if (raw.includes(p)) {
          return {
            name: m.name,
            emoji: e(m.emojiName),
            emojiName: m.emojiName,
            genKey: m.genKey,
          };
        }
      }
    }
  }

  let fallbackName = 'Unknown Mission';
  let genKey: string | undefined;
  if (mission.missionGenerator) {
    const match = mission.missionGenerator.match(/MissionGen_[A-Za-z0-9_]+/);
    if (match) {
      genKey = match[0];
      fallbackName = traducir(match[0]) || traducir(`Quest:${match[0]}`) || match[0];
    }
  } else if (mission.missionRewards?.tierGroupName) {
    const key = mission.missionRewards.tierGroupName;
    fallbackName = traducir(key) || traducir(`Quest:${key}`) || key;
  }
  // The translated fallback might be a proper mission name (e.g. translateGameName returned
  // 'Repair the Shelter'). Re-check it against known mission names so we assign the right icon
  // instead of defaulting to world_quest.
  const nameLower = fallbackName.toLowerCase();
  for (const m of MISSION_PATTERNS) {
    if (nameLower.includes(m.name.toLowerCase())) {
      return { name: m.name, emoji: e(m.emojiName), emojiName: m.emojiName, genKey: m.genKey ?? genKey };
    }
  }

  return { name: fallbackName, emoji: e('world_quest'), emojiName: 'world_quest', genKey };
}

// ── Zone detection ─────────────────────────────────────────

function getGeographicZone(power: number): string {
  if (power >= 1 && power <= 18) return 'Stonewood';
  if (power >= 19 && power <= 40) return 'Plankerton';
  if (power >= 41 && power <= 75) return 'Canny Valley';
  if (power >= 76) return 'Twine Peaks';
  return 'Stonewood';
}

// Zone detection mirrors the GLOW Launcher's logic:
//   1. V-Bucks reward           → V-Bucks
//   2. PhoenixXP reward         → Ventures
//   3. Unrecognised mission type → Events  (emojiName === 'world_quest')
//   4. Everything else          → geographic by power
// This never relies on theater ID strings, which vary between API versions.
function getZone(
  power: number,
  rewardItems: AlertRewardItem[],
  missionEmojiName: string,
): string {
  if (rewardItems.some(r => r.itemType.toLowerCase().includes('currency_mtxswap'))) return 'V-Bucks';
  if (rewardItems.some(r => r.itemType.toLowerCase().includes('phoenixxp'))) return 'Ventures';
  if (missionEmojiName === 'world_quest') return 'Events';
  return getGeographicZone(power);
}

// ── Resource emoji resolution ──────────────────────────────

function extractRarity(itemType: string): string | null {
  if (!itemType) return null;
  const rarityMatch = itemType.match(/_(vr|sr|er|r|uc|c)(?:_|$)/i);
  return rarityMatch ? rarityMatch[1].toLowerCase() : null;
}

function getResourceEmoji(itemType: string): string {
  if (!itemType) return '';
  const tipo = itemType.toLowerCase();

  // AccountResource
  if (tipo.includes('accountresource:')) {
    const key = itemType.replace(/^AccountResource:/i, '').toLowerCase();
    // Direct: resources_<key>
    const direct = e(`resources_${key}`);
    if (direct) return direct;
    // phoenixxp alias
    if (key.includes('phoenixxp')) return e('resources_phoenixxp');
    // Currency folder items (eventcurrency_*)
    const currency = e(`currency_${key}`);
    if (currency) return currency;
    // Truncated name fallback
    return eSuffix(key);
  }

  // Ingredient
  if (tipo.includes('ingredient:')) {
    const key = itemType.replace(/^Ingredient:/i, '').toLowerCase();
    const direct = e(`ingredients_${key}`);
    if (direct) return direct;
    const stripped = key.replace(/^reagent_/, '');
    return e(`ingredients_${stripped}`) || eSuffix(stripped);
  }

  // Worker (Survivor)
  if (tipo.includes('worker:')) {
    const rarity = extractRarity(itemType) || 'sr';
    if (tipo.includes('manager')) return eSuffix(`voucher_generic_manager_${rarity}`);
    return eSuffix(`voucher_generic_worker_${rarity}`);
  }

  // Hero
  if (tipo.includes('hero:')) {
    const rarity = extractRarity(itemType) || 'sr';
    return eSuffix(`voucher_generic_hero_${rarity}`);
  }

  // Schematic
  if (tipo.includes('schematic:')) {
    const rarity = extractRarity(itemType) || 'sr';
    return eSuffix(`voucher_generic_schematic_${rarity}`);
  }

  // Defender
  if (tipo.includes('defender:')) {
    const rarity = extractRarity(itemType) || 'sr';
    return eSuffix(`voucher_generic_defender_${rarity}`);
  }

  // CardPack
  if (tipo.includes('cardpack:')) {
    if (tipo.includes('reagent_alteration_upgrade')) {
      const m = tipo.match(/(sr|vr|r|uc|c)$/);
      return eSuffix(`reagent_alteration_upgrade_${m?.[1] || 'sr'}`);
    }
    const t0 = tipo.match(/(reagent_c_t0\d)/);
    if (t0) return e(`resources_${t0[1]}`);
    if (tipo.includes('heroxp')) return e('resources_heroxp');
    if (tipo.includes('personnelxp')) return e('resources_personnelxp');
    if (tipo.includes('schematicxp')) return e('resources_schematicxp');
    if (tipo.includes('phoenixxp')) return e('resources_phoenixxp');
    if (tipo.includes('voucher_cardpack')) return eSuffix('voucher_cardpack_jackpot');
    if (tipo.includes('voucher_basicpack')) return eSuffix('voucher_basicpack');
    return '';
  }

  return '';
}

// ── Modifier helpers ───────────────────────────────────────

function extractModifierName(itemType: string): string {
  if (!itemType) return 'default';
  if (itemType.startsWith('GameplayModifier:')) return itemType.replace('GameplayModifier:', '');
  const parts = itemType.split('/');
  const lastPart = parts[parts.length - 1];
  if (lastPart.includes('.')) {
    const name = lastPart.split('.')[1];
    return name ? name.replace(/'/g, '') : 'default';
  }
  return lastPart ? lastPart.replace(/'/g, '') : 'default';
}

function getModifierDisplayName(modName: string): string {
  if (!modName) return 'Unknown Modifier';
  let translated = traducir(`GameplayModifier:${modName}`);
  if (translated !== `GameplayModifier:${modName}`) return translated;
  translated = traducir(modName);
  if (translated !== modName) return translated;

  const fallback: Record<string, string> = {
    GM_Phoenix_CloseQuarters: 'Close Quarters',
    GM_Phoenix_SuperConstructor: 'Super Constructor',
    GM_Phoenix_SuperHeroic: 'Super Heroic',
    GM_Phoenix_SuperNinja: 'Super Ninja',
    GM_Phoenix_SuperOutlander: 'Super Outlander',
    GM_Phoenix_SuperSoldier: 'Super Soldier',
    GM_Phoenix_RageMeter: 'Rage Meter',
    minibossenableprimarymissionitem: 'Epic Mini-Boss',
  };
  return fallback[modName] || modName.replace(/_/g, ' ');
}

function getModifierEmoji(modName: string): string {
  const lower = modName.toLowerCase();
  return e(`modifiers_${lower}`) || eSuffix(lower);
}

// ── Zone order ─────────────────────────────────────────────

export const ZONE_ORDER = [
  'V-Bucks',
  'Twine Peaks',
  'Canny Valley',
  'Plankerton',
  'Stonewood',
  'Ventures',
  'Events',
];

// ── Zone & power emoji exports ─────────────────────────────

const ZONE_EMOJI_NAMES: Record<string, string[]> = {
  'V-Bucks': ['resources_currency_mtxswap', 'currency_mtxswap', 'vbucks'],
  'Twine Peaks': ['difficulties_twine', 'twine'],
  'Canny Valley': ['difficulties_canny', 'canny'],
  Plankerton: ['difficulties_plankerton', 'plankerton'],
  Stonewood: ['difficulties_stonewood', 'stone'],
  Ventures: ['stw_ventures', 'ventures'],
  Events: ['world_quest', 'event', 'events'],
};

const ZONE_EMOJI_DISCORD_IDS: Record<string, string> = {
  'V-Bucks': '1348693071323332678',
  'Twine Peaks': '1480974416555802736',
  'Canny Valley': '1480974390773547221',
  Plankerton: '1480974405369856020',
  Stonewood: '1480974412986581012',
  Ventures: '1480967215158132789',
  Events: '1480967297311969423',
};

export function getZoneEmoji(zone: string): string {
  const candidates = ZONE_EMOJI_NAMES[zone] ?? [];
  for (const name of candidates) {
    const hit = e(name, '');
    if (hit) return hit;
  }
  const discordId = ZONE_EMOJI_DISCORD_IDS[zone];
  if (discordId) {
    const byId = eByDiscordId(discordId, '');
    if (byId) return byId;
  }
  log.commands.warn({ zone, candidates, discordId }, '[alerts] zone emoji not found');
  return '';
}

const ZONE_COLORS: Record<string, number> = {
  'V-Bucks': 0xf0b132,
  'Twine Peaks': 0xe74c3c,
  'Canny Valley': 0xe67e22,
  Plankerton: 0xf1c40f,
  Stonewood: 0x2ecc71,
  Ventures: 0x9b59b6,
  Events: 0x00bcd4,
};

export function getZoneColor(zone: string): number {
  return ZONE_COLORS[zone] || 0x2b2d31;
}

export function getPowerEmoji(): string {
  const hit = e('stw_power', '') || eByDiscordId('1480967211937173629', '');
  if (!hit) log.commands.warn('[alerts] power emoji stw_power not found in export');
  return hit;
}

// ── Main API ───────────────────────────────────────────────

export async function getMissions(accessToken: string, forceRefresh = false): Promise<ZoneMissions[]> {
  const today = getUTCDateKey();
  if (!forceRefresh && _cachedResult && _cachedUTCDate === today) {
    return _cachedResult;
  }

  const { data: worldInfo } = await axios.get(Endpoints.STW_WORLD_INFO, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 20_000,
  });

  // Map mission alerts by key (theaterId_tileIndex)
  const alertsByMission: Record<string, any[]> = {};
  if (Array.isArray(worldInfo.missionAlerts)) {
    for (const group of worldInfo.missionAlerts) {
      if (!Array.isArray(group.availableMissionAlerts)) continue;
      for (const alert of group.availableMissionAlerts) {
        const key = `${group.theaterId}_${alert.tileIndex ?? ''}`;
        (alertsByMission[key] ??= []).push(alert);
      }
    }
  }

  // Process missions
  const allMissions: ProcessedMission[] = [];

  if (Array.isArray(worldInfo.missions)) {
    for (const group of worldInfo.missions) {
      if (!Array.isArray(group.availableMissions)) continue;

      for (const mission of group.availableMissions) {
        try {
          const key = `${group.theaterId}_${mission.tileIndex ?? ''}`;
          const missionAlerts = alertsByMission[key] || [];

          // Extract alert rewards
          const alerts: AlertRewardItem[] = [];
          for (const a of missionAlerts) {
            if (a.missionAlertRewards?.items) {
              for (const item of a.missionAlertRewards.items) {
                alerts.push({
                  itemType: item.itemType,
                  quantity: item.quantity || 1,
                  name: traducir(item.itemType),
                  emoji: getResourceEmoji(item.itemType),
                });
              }
            }
          }

          // Extract mission rewards
          const rewards: AlertRewardItem[] = [];
          if (mission.missionRewards?.items) {
            for (const item of mission.missionRewards.items) {
              rewards.push({
                itemType: item.itemType,
                quantity: item.quantity || 1,
                name: traducir(item.itemType),
                emoji: getResourceEmoji(item.itemType),
              });
            }
          }

          // Extract power
          let power = 0;
          if (mission.missionDifficultyInfo?.rowName) {
            const powerLabel = traducir(mission.missionDifficultyInfo.rowName) || mission.missionDifficultyInfo.rowName;
            const m = powerLabel.match(/^(\d+)/);
            if (m) power = parseInt(m[1]);
          }

          // Mission name and emoji
          const parsed = parseMission(mission);
          if (parsed.name.toLowerCase().includes('storm shield')) continue;

          // Zone detection
          const allItems = [...alerts, ...rewards];
          const zone = getZone(power, allItems, parsed.emojiName);
          const zoneGeo = zone === 'V-Bucks' ? getGeographicZone(power) : zone;

          // Modifiers
          const modifiers: AlertModifier[] = [];
          for (const a of missionAlerts) {
            if (a.missionAlertModifiers?.items) {
              for (const mod of a.missionAlertModifiers.items) {
                if (mod.itemType) {
                  const modName = extractModifierName(mod.itemType);
                  modifiers.push({
                    name: getModifierDisplayName(modName),
                    emoji: getModifierEmoji(modName),
                    itemType: mod.itemType,
                  });
                }
              }
            }
          }

          allMissions.push({
            id: key,
            theaterId: group.theaterId,
            tileIndex: mission.tileIndex ?? 0,
            power,
            zone,
            zoneGeo,
            missionName: parsed.name,
            missionGenKey: parsed.genKey,
            missionEmoji: parsed.emoji,
            alerts,
            rewards,
            modifiers,
            hasAlerts: alerts.length > 0,
          });
        } catch {
          // Skip broken missions
        }
      }
    }
  }

  // Group by zone
  const zoneMap: Record<string, ProcessedMission[]> = {};
  for (const m of allMissions) {
    if (!zoneMap[m.zone]) zoneMap[m.zone] = [];
    zoneMap[m.zone].push(m);
  }

  // Sort: alerts first, then by power desc
  for (const missions of Object.values(zoneMap)) {
    missions.sort((a, b) => {
      if (a.hasAlerts && !b.hasAlerts) return -1;
      if (!a.hasAlerts && b.hasAlerts) return 1;
      return b.power - a.power;
    });
  }

  // Build result ordered by ZONE_ORDER
  const result: ZoneMissions[] = [];
  for (const zoneName of ZONE_ORDER) {
    if (zoneMap[zoneName]?.length) {
      result.push({ zone: zoneName, missions: zoneMap[zoneName] });
    }
  }
  for (const [zoneName, missions] of Object.entries(zoneMap)) {
    if (!ZONE_ORDER.includes(zoneName) && missions.length > 0) {
      result.push({ zone: zoneName, missions });
    }
  }

  _cachedResult = result;
  _cachedUTCDate = today;
  return result;
}

// ── Category helpers (for Overview tab) ────────────────────

export interface AlertCategory {
  id: string;
  title: string;
  emojiName: string;
  filter: (m: ProcessedMission) => boolean;
  rewardFilter?: (r: AlertRewardItem) => boolean;
}

function isVBucks(r: AlertRewardItem): boolean {
  return r.itemType.toLowerCase().includes('currency_mtxswap');
}
function isSurvivorSR(r: AlertRewardItem): boolean {
  return r.itemType.toLowerCase().includes('worker:') && /_(sr)(?:_|$)/i.test(r.itemType);
}
function isHeroSR(r: AlertRewardItem): boolean {
  return r.itemType.toLowerCase().includes('hero:') && /_(sr)(?:_|$)/i.test(r.itemType);
}
function isDefenderSR(r: AlertRewardItem): boolean {
  return r.itemType.toLowerCase().includes('defender:') && /_(sr)(?:_|$)/i.test(r.itemType);
}

function hasRewardMatch(m: ProcessedMission, test: (r: AlertRewardItem) => boolean): boolean {
  return m.alerts.some(test) || m.rewards.some(test);
}

export function getMatchingRewards(m: ProcessedMission, test: (r: AlertRewardItem) => boolean): AlertRewardItem[] {
  return [...m.alerts.filter(test), ...m.rewards.filter(test)];
}

export const CATEGORIES: AlertCategory[] = [
  {
    id: 'vbucks',
    title: 'V-Bucks',
    emojiName: 'resources_currency_mtxswap',
    filter: (m) => m.zone === 'V-Bucks' || hasRewardMatch(m, isVBucks),
    rewardFilter: isVBucks,
  },
  {
    id: 'legendary-survivors',
    title: 'Legendary Survivors',
    emojiName: 'ources_voucher_generic_worker_sr',
    filter: (m) => hasRewardMatch(m, isSurvivorSR),
    rewardFilter: isSurvivorSR,
  },
  {
    id: 'pl-160',
    title: 'PL 160',
    emojiName: 'difficulties_red_skull',
    filter: (m) => m.power === 160,
  },
  {
    id: 'legendary-heroes',
    title: 'Legendary Heroes',
    emojiName: 'esources_voucher_generic_hero_sr',
    filter: (m) => hasRewardMatch(m, isHeroSR),
    rewardFilter: isHeroSR,
  },
  {
    id: 'legendary-defenders',
    title: 'Legendary Defenders',
    emojiName: 'rces_voucher_generic_defender_sr',
    filter: (m) => hasRewardMatch(m, isDefenderSR),
    rewardFilter: isDefenderSR,
  },
];
