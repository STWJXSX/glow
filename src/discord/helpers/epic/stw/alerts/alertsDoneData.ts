/**
 * Shared data helpers for /alerts-done (single + bulk).
 */

import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';
import {
  getMissions,
  getZoneEmoji,
  getPowerEmoji,
  type ZoneMissions,
  type ProcessedMission,
} from './alertsHelper.ts';

export interface ClaimEntry {
  missionAlertId: string;
  redemptionDateUtc: string;
  evictClaimDataAfterUtc: string;
}

export interface CompletedAlertRow {
  mission: ProcessedMission;
  date: string;
}

export async function getClaimData(accountId: string, accessToken: string): Promise<ClaimEntry[]> {
  const url = `${Endpoints.MCP}/${accountId}/client/QueryProfile?profileId=campaign&rvn=-1`;
  const { data } = await axios.post(url, {}, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 20_000,
  });

  const stats = data?.profileChanges?.[0]?.profile?.stats?.attributes;
  if (!stats?.mission_alert_redemption_record?.claimData) return [];
  return stats.mission_alert_redemption_record.claimData;
}

export async function buildAlertIdMap(
  accessToken: string,
  zones: ZoneMissions[],
): Promise<Map<string, ProcessedMission>> {
  const { data: worldInfo } = await axios.get(Endpoints.STW_WORLD_INFO, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 20_000,
  });

  const keyToAlertIds = new Map<string, string[]>();
  if (Array.isArray(worldInfo.missionAlerts)) {
    for (const group of worldInfo.missionAlerts) {
      if (!Array.isArray(group.availableMissionAlerts)) continue;
      for (const alert of group.availableMissionAlerts) {
        const key = `${group.theaterId}_${alert.tileIndex ?? ''}`;
        const ids = keyToAlertIds.get(key) ?? [];
        if (alert.missionAlertGuid) ids.push(alert.missionAlertGuid);
        keyToAlertIds.set(key, ids);
      }
    }
  }

  const missionById = new Map<string, ProcessedMission>();
  for (const zone of zones) {
    for (const m of zone.missions) {
      missionById.set(m.id, m);
    }
  }

  const result = new Map<string, ProcessedMission>();
  for (const [key, alertIds] of keyToAlertIds.entries()) {
    const mission = missionById.get(key);
    if (!mission) continue;
    for (const alertId of alertIds) {
      result.set(alertId, mission);
    }
  }

  return result;
}

export function formatAlertRewards(m: ProcessedMission, max = 3): string {
  const items = m.alerts.filter(r => r.emoji).slice(0, max);
  if (items.length === 0) return '';
  return items.map(r =>
    `${r.emoji} x${r.quantity >= 1000 ? (r.quantity / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : r.quantity}`,
  ).join(' ');
}

export function resolveCompletedAlerts(
  claimData: ClaimEntry[],
  alertMap: Map<string, ProcessedMission>,
): { completed: CompletedAlertRow[]; unknownCount: number } {
  const completed: CompletedAlertRow[] = [];
  let unknownCount = 0;

  for (const claim of claimData) {
    const mission = alertMap.get(claim.missionAlertId);
    if (mission) {
      completed.push({ mission, date: claim.redemptionDateUtc });
    } else {
      unknownCount++;
    }
  }

  completed.sort((a, b) => {
    if (a.mission.zone !== b.mission.zone) return a.mission.zone.localeCompare(b.mission.zone);
    return b.mission.power - a.mission.power;
  });

  return { completed, unknownCount };
}

export function formatCompletedAlertLine(
  m: ProcessedMission,
  successEmoji: string,
): string {
  const pw = getPowerEmoji();
  const ze = getZoneEmoji(m.zone);
  const rewards = formatAlertRewards(m);
  const zoneLabel = m.zone === 'V-Bucks' ? m.zoneGeo : m.zone;
  return `${successEmoji} ${pw} \`${m.power}\` ${m.missionEmoji} **${m.missionName}** ${ze} ${zoneLabel}${rewards ? `  ${rewards}` : ''}`;
}

/** World missions list (cached per UTC day inside getMissions). */
export async function fetchAlertZones(accessToken: string): Promise<ZoneMissions[]> {
  return getMissions(accessToken);
}
