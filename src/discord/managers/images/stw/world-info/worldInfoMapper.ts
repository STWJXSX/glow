import type { ProcessedMission } from '#helpers/epic/stw/alerts/alertsHelper.ts';
import { formatAlertsZoneShortLabel, translateAlertsMissionName } from '#helpers/epic/stw/alerts/alertsDisplayTranslations.ts';
import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import {
  resolveStwMissionIconPath,
  resolveStwModifierIconPath,
} from './worldInfoAssetResolver.ts';
import {
  getHeroRewardRarityBorderColor,
  resolveRewardDisplayIconPath,
} from './worldInfoRewardDisplay.ts';
import type { WorldInfoMissionRow, WorldInfoRewardIcon } from './types.ts';

function groupRewards(items: WorldInfoRewardIcon[]): WorldInfoRewardIcon[] {
  const map = new Map<string, WorldInfoRewardIcon>();
  for (const item of items) {
    if (!item.iconPath) continue;
    const key = `${item.iconPath}::${item.rarityBorderColor ?? ''}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return [...map.values()];
}

export function mapProcessedMissionToRow(
  mission: ProcessedMission,
  lang: SupportedLanguage,
): WorldInfoMissionRow {
  const rewardItems = [...mission.alerts, ...mission.rewards].map((reward) => ({
    iconPath: resolveRewardDisplayIconPath(reward.itemType),
    quantity: reward.quantity,
    itemType: reward.itemType,
    rarityBorderColor: getHeroRewardRarityBorderColor(reward.itemType),
  }));

  const zoneBadgeZone = mission.zone === 'V-Bucks' ? mission.zoneGeo : mission.zone;
  const zoneLabel = formatAlertsZoneShortLabel(zoneBadgeZone);

  return {
    id: mission.id,
    power: mission.power,
    zone: mission.zone,
    zoneGeo: mission.zoneGeo,
    zoneLabel,
    zoneBadgeZone,
    missionName: translateAlertsMissionName(mission, lang),
    missionIconPath: resolveStwMissionIconPath(mission.missionName),
    hasAlerts: mission.hasAlerts,
    modifiers: mission.modifiers.map((modifier) => ({
      iconPath: resolveStwModifierIconPath(modifier.name),
    })),
    rewards: groupRewards(rewardItems),
  };
}

export function mapProcessedMissionsToRows(
  missions: ProcessedMission[],
  lang: SupportedLanguage,
): WorldInfoMissionRow[] {
  return missions.map((mission) => mapProcessedMissionToRow(mission, lang));
}
