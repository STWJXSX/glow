import {
  parseHomebaseLevel,
  parseStormShieldZones,
} from '../resources/resourcesParser.ts';
import { resolveImageDisplayName } from '../stwImageBranding.ts';
import { renderStwOutpostImage } from './outpostRenderer.ts';
import type {
  GenerateStwOutpostImageOptions,
  GenerateStwOutpostImageResult,
  StwOutpostPanelData,
} from './types.ts';

export const STW_OUTPOST_FILE_NAME = 'stw-outpost.webp';

export async function generateStwOutpostImage(
  options: GenerateStwOutpostImageOptions,
): Promise<GenerateStwOutpostImageResult> {
  const stormShields = parseStormShieldZones(options.campaignProfile, options.zoneLabels);
  const data: StwOutpostPanelData = {
    displayName: options.displayName
      ? resolveImageDisplayName(options.displayName, options.branding)
      : 'Storm Shield',
    homebaseLevel: parseHomebaseLevel(options.campaignProfile),
    stormShields,
  };

  const buffer = await renderStwOutpostImage(data, options.branding);
  return {
    buffer,
    fileName: STW_OUTPOST_FILE_NAME,
    data,
  };
}
