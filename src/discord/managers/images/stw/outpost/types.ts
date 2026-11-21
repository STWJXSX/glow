import type { StwImageBrandingOptions } from '../stwImageBranding.ts';
import type { StwStormShieldZone } from '../resources/types.ts';

export interface StwOutpostPanelData {
  displayName: string;
  homebaseLevel: number;
  stormShields: StwStormShieldZone[];
}

export interface GenerateStwOutpostImageOptions {
  campaignProfile: Record<string, unknown>;
  displayName?: string;
  zoneLabels?: Partial<Record<StwStormShieldZone['key'], string>>;
  branding?: StwImageBrandingOptions;
}

export interface GenerateStwOutpostImageResult {
  buffer: Buffer;
  fileName: string;
  data: StwOutpostPanelData;
}
