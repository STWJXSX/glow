import { parseStwResourcesPanel } from './resourcesParser.ts';
import { renderStwResourcesImage } from './resourcesRenderer.ts';
import { resolveImageDisplayName } from '../stwImageBranding.ts';
import { prepareAccountAvatar } from '../campaign/stwCardBranding.ts';
import type {
  GenerateStwResourcesImageOptions,
  GenerateStwResourcesImageResult,
  StwResourcesPanelData,
} from './types.ts';

export const STW_RESOURCES_FILE_NAME = 'stw-resources.webp';

export async function generateStwResourcesImage(
  options: GenerateStwResourcesImageOptions,
): Promise<GenerateStwResourcesImageResult> {
  const data: StwResourcesPanelData = await parseStwResourcesPanel(options);
  if (options.displayName) {
    data.displayName = resolveImageDisplayName(options.displayName, options.branding);
  }

  let avatarBuf = options.accountAvatarBuffer ?? null;
  if (!avatarBuf && (options.accessToken || options.accountId || options.athenaProfileBody || options.discordUserId)) {
    try {
      avatarBuf = await prepareAccountAvatar(
        options.accessToken || '',
        options.accountId || '',
        54,
        options.discordUserId,
        options.athenaProfileBody,
      );
    } catch {
      // fallback if avatar cannot be loaded
    }
  }

  const buffer = await renderStwResourcesImage(data, options.branding, avatarBuf);
  return {
    buffer,
    fileName: STW_RESOURCES_FILE_NAME,
    data,
  };
}

export { parseStwResourcesPanel, renderStwResourcesImage };
