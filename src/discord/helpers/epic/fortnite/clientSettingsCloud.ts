import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';
import {
  CLIENT_SETTINGS_PLATFORMS,
  type ClientSettingsPlatformDef,
  platformMatchesFilename,
} from './clientSettingsPlatforms.ts';

export interface UserCloudFileMeta {
  uniqueFilename: string;
  filename?: string;
  hash?: string;
  length?: number;
  uploaded?: string;
}

export async function listUserCloudFiles(
  accessToken: string,
  accountId: string,
): Promise<UserCloudFileMeta[]> {
  const { data } = await axios.get<UserCloudFileMeta[]>(
    `${Endpoints.CLOUD_STORAGE_USER}/${accountId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 20_000,
    },
  );
  return Array.isArray(data) ? data : [];
}

export async function downloadUserCloudFile(
  accessToken: string,
  accountId: string,
  uniqueFilename: string,
): Promise<Buffer> {
  const { data } = await axios.get<ArrayBuffer>(
    `${Endpoints.CLOUD_STORAGE_USER}/${accountId}/${encodeURIComponent(uniqueFilename)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'arraybuffer',
      timeout: 60_000,
    },
  );
  return Buffer.from(data);
}

export async function uploadUserCloudFile(
  accessToken: string,
  accountId: string,
  uniqueFilename: string,
  body: Buffer,
): Promise<void> {
  await axios.put(
    `${Endpoints.CLOUD_STORAGE_USER}/${accountId}/${encodeURIComponent(uniqueFilename)}`,
    body,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      timeout: 60_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    },
  );
}

export function findCloudFileForPlatform(
  files: UserCloudFileMeta[],
  platform: ClientSettingsPlatformDef,
): UserCloudFileMeta | undefined {
  return files.find((f) => platformMatchesFilename(platform, f.uniqueFilename));
}

export type PlatformTransferResult =
  | { ok: true; platformId: string; uniqueFilename: string; bytes: number }
  | { ok: false; platformId: string; reason: 'missing' | 'error'; message?: string };

export async function copyPlatformSettingsOnAccount(
  accessToken: string,
  accountId: string,
  fromPlatform: ClientSettingsPlatformDef,
  toPlatform: ClientSettingsPlatformDef,
): Promise<PlatformTransferResult> {
  if (fromPlatform.id === toPlatform.id) {
    return { ok: false, platformId: fromPlatform.id, reason: 'error', message: 'same_platform' };
  }
  try {
    const files = await listUserCloudFiles(accessToken, accountId);
    const source = findCloudFileForPlatform(files, fromPlatform);
    if (!source) {
      return { ok: false, platformId: fromPlatform.id, reason: 'missing' };
    }
    const data = await downloadUserCloudFile(accessToken, accountId, source.uniqueFilename);
    await uploadUserCloudFile(accessToken, accountId, toPlatform.uploadFilename, data);
    return {
      ok: true,
      platformId: toPlatform.id,
      uniqueFilename: toPlatform.uploadFilename,
      bytes: data.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, platformId: fromPlatform.id, reason: 'error', message };
  }
}

export async function copyAllPlatformSettingsBetweenAccounts(
  sourceToken: string,
  sourceAccountId: string,
  targetToken: string,
  targetAccountId: string,
): Promise<PlatformTransferResult[]> {
  const results: PlatformTransferResult[] = [];
  let sourceFiles: UserCloudFileMeta[] = [];
  try {
    sourceFiles = await listUserCloudFiles(sourceToken, sourceAccountId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return CLIENT_SETTINGS_PLATFORMS.map((p) => ({
      ok: false,
      platformId: p.id,
      reason: 'error' as const,
      message,
    }));
  }

  for (const platform of CLIENT_SETTINGS_PLATFORMS) {
    const source = findCloudFileForPlatform(sourceFiles, platform);
    if (!source) {
      results.push({ ok: false, platformId: platform.id, reason: 'missing' });
      continue;
    }
    try {
      const data = await downloadUserCloudFile(sourceToken, sourceAccountId, source.uniqueFilename);
      await uploadUserCloudFile(targetToken, targetAccountId, platform.uploadFilename, data);
      results.push({
        ok: true,
        platformId: platform.id,
        uniqueFilename: platform.uploadFilename,
        bytes: data.length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ ok: false, platformId: platform.id, reason: 'error', message });
    }
  }
  return results;
}

export async function downloadPlatformsForBackup(
  accessToken: string,
  accountId: string,
  platformIds: string[],
): Promise<Array<PlatformTransferResult & { data?: Buffer }>> {
  const files = await listUserCloudFiles(accessToken, accountId);
  const out: Array<PlatformTransferResult & { data?: Buffer }> = [];

  const targets = platformIds.includes('all')
    ? CLIENT_SETTINGS_PLATFORMS
    : CLIENT_SETTINGS_PLATFORMS.filter((p) => platformIds.includes(p.id));

  for (const platform of targets) {
    const source = findCloudFileForPlatform(files, platform);
    if (!source) {
      out.push({ ok: false, platformId: platform.id, reason: 'missing' });
      continue;
    }
    try {
      const data = await downloadUserCloudFile(accessToken, accountId, source.uniqueFilename);
      out.push({
        ok: true,
        platformId: platform.id,
        uniqueFilename: source.uniqueFilename,
        bytes: data.length,
        data,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      out.push({ ok: false, platformId: platform.id, reason: 'error', message });
    }
  }
  return out;
}
