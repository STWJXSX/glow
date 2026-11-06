import type { StwImageBrandingOptions } from '../stwImageBranding.ts';

export interface StwStormShieldZone {
  theater: 1 | 2 | 3 | 4;
  key: 'stonewood' | 'plankerton' | 'canny' | 'twine';
  label: string;
  completed: number;
  max: number;
  enduranceComplete: boolean;
}

export interface StwLongChallenge {
  id: string;
  label: string;
  current: number;
  target: number;
  complete: boolean;
}

export interface StwResourceTile {
  templateId: string;
  catalogId: string;
  label: string;
  quantity: number;
  iconPath: string | null;
  iconUrl: string | null;
}

export interface StwSchematicBuckets {
  pl144: number;
  pl130: number;
  pl106: number;
  pl77: number;
  pl51: number;
  pl26: number;
  legacy: number;
  supercharged: number;
  stars5: number;
  stars4: number;
  stars3: number;
  stars2: number;
  stars1: number;
}

export interface StwResourcesPanelData {
  displayName?: string;
  homebaseLevel: number;
  collectionBookLevel: number;
  founderEdition: string;
  stormShields: StwStormShieldZone[];
  challenges: StwLongChallenge[];
  resources: StwResourceTile[];
  schematics: StwSchematicBuckets;
}

export interface ParseStwResourcesInput {
  campaignProfile: Record<string, unknown>;
  outpostProfile?: Record<string, unknown> | null;
  accessToken?: string;
  accountId?: string;
}

export interface GenerateStwResourcesImageOptions extends ParseStwResourcesInput {
  displayName?: string;
  branding?: StwImageBrandingOptions;
  discordUserId?: string;
  accountAvatarBuffer?: Buffer | null;
  athenaProfileBody?: unknown;
}

export interface GenerateStwResourcesImageResult {
  buffer: Buffer;
  fileName: string;
  data: StwResourcesPanelData;
}
