export type FastSwapErrorCode =
  | 'NOT_IN_MISSION'
  | 'NO_LOADOUT'
  | 'NO_HEROES'
  | 'LEADER_SWAP_FAILED';

export interface FastSwapLoadout {
  guid: string;
  index: number;
  commanderGuid: string;
  commanderTemplateId: string;
  commanderDisplayName: string;
  commanderLevel: number;
  classType: string;
}

export interface FastSwapRestoreSnapshot {
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
  gadgets: Array<{ templateId: string; slotIndex: number }>;
  gadgetDisplayNames: string[];
}

export type FastSwapActionResult =
  | {
      ok: true;
      loadout: FastSwapLoadout;
      restoreMinutes: number;
      restoreSnapshots: FastSwapRestoreSnapshot[];
    }
  | { ok: false; code: FastSwapErrorCode };

export type EquipSameActionResult =
  | { ok: true; loadout: FastSwapLoadout }
  | { ok: false; code: FastSwapErrorCode };

export type FastSwapRestoreReason = 'left_mission' | 'timeout';
