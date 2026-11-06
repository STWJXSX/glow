/**
 * Merges Fortnite AES keys from all public sources into one clean payload.
 */

import axios from 'axios';

const SOURCES = [
  'https://fortnite-api.com/v2/aes',
  'https://api.fortniteapi.com/v1/aes',
  'https://uedb.dev/svc/api/v1/fortnite/aes',
  'https://export-service-new.dillyapis.com/v1/aes',
] as const;

export interface MergedDynamicKey {
  pakGuid: string;
  key: string;
  name: string | null;
  keychain: string | null;
}

export interface MergedUnloadedPak {
  guid: string;
  name: string | null;
  fileCount: number | null;
}

export interface MergedAesPayload {
  generatedAt: string;
  build: string | null;
  version: string | null;
  mainKey: string | null;
  dynamicKeys: MergedDynamicKey[];
  unloaded: MergedUnloadedPak[];
}

type InternalKey = {
  pakGuid: string;
  key: string;
  name?: string;
  keychain?: string;
};

type InternalUnloaded = {
  guid: string;
  name?: string;
  fileCount?: number;
};

function normGuid(guid: string): string {
  return guid.replace(/-/g, '').toUpperCase();
}

function normKey(key: string): string {
  const hex = key.replace(/^0x/i, '').toLowerCase();
  if (hex.length !== 64) return key.trim();
  return `0x${hex}`;
}

function extractKeys(payload: unknown): InternalKey[] {
  const data = payload as Record<string, unknown>;
  const root = (data.data as Record<string, unknown> | undefined) ?? data;
  const rows = (root.dynamicKeys ?? data.dynamicKeys) as Array<Record<string, string>> | undefined;

  const out: InternalKey[] = [];
  for (const row of rows ?? []) {
    const guid = normGuid(row.pakGuid ?? row.guid ?? '');
    const key = row.key?.trim();
    if (!guid || guid.length !== 32 || !key) continue;
    out.push({
      pakGuid: guid,
      key: normKey(key),
      name: row.name ?? row.pakFilename ?? undefined,
      keychain: row.keychain ?? undefined,
    });
  }
  return out;
}

function extractUnloaded(payload: unknown): InternalUnloaded[] {
  const data = payload as { unloaded?: Array<Record<string, unknown>> };
  return (data.unloaded ?? []).map((row) => ({
    guid: normGuid(String(row.guid ?? '')),
    name: typeof row.name === 'string' ? row.name : undefined,
    fileCount: typeof row.fileCount === 'number' ? row.fileCount : undefined,
  })).filter((row) => row.guid.length === 32);
}

function pickMeta(
  payload: unknown,
  meta: { mainKey: string; version: string; build: string },
): void {
  const data = payload as Record<string, unknown>;
  const root = (data.data as Record<string, unknown> | undefined) ?? data;

  const mainKey = String(root.mainKey ?? data.mainKey ?? '').trim();
  const version = String(root.version ?? data.version ?? '').trim();
  const build = String(root.build ?? data.build ?? '').trim();

  if (!meta.mainKey && mainKey) meta.mainKey = normKey(mainKey);
  if (!meta.version && version) meta.version = version;
  if (!meta.build && build) meta.build = build;
}

function mergeDynamic(into: Map<string, InternalKey>, incoming: InternalKey[]): void {
  for (const key of incoming) {
    const existing = into.get(key.pakGuid);
    if (!existing) {
      into.set(key.pakGuid, { ...key });
      continue;
    }
    if (!existing.name && key.name) existing.name = key.name;
    if (!existing.keychain && key.keychain) existing.keychain = key.keychain;
  }
}

function mergeUnloaded(into: Map<string, InternalUnloaded>, incoming: InternalUnloaded[]): void {
  for (const row of incoming) {
    const existing = into.get(row.guid);
    if (!existing) {
      into.set(row.guid, { ...row });
      continue;
    }
    if (!existing.name && row.name) existing.name = row.name;
    if (!existing.fileCount && row.fileCount) existing.fileCount = row.fileCount;
  }
}

function sortLabel(name: string | undefined, fallback: string): string {
  return (name ?? fallback).toLowerCase();
}

export async function fetchMergedAesKeys(): Promise<MergedAesPayload> {
  const dynamic = new Map<string, InternalKey>();
  const unloaded = new Map<string, InternalUnloaded>();
  const meta = { mainKey: '', version: '', build: '' };

  const results = await Promise.allSettled(
    SOURCES.map(async (url) => {
      const { data } = await axios.get(url, { timeout: 45_000 });
      return data;
    }),
  );

  let fetchedAny = false;
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    fetchedAny = true;
    pickMeta(result.value, meta);
    mergeDynamic(dynamic, extractKeys(result.value));
    mergeUnloaded(unloaded, extractUnloaded(result.value));
  }

  if (!fetchedAny) {
    throw new Error('AES fetch failed');
  }

  const dynamicKeys = [...dynamic.values()]
    .sort((a, b) => sortLabel(a.name, a.pakGuid).localeCompare(sortLabel(b.name, b.pakGuid)))
    .map((key) => ({
      pakGuid: key.pakGuid,
      key: key.key,
      name: key.name ?? null,
      keychain: key.keychain ?? null,
    }));

  const unloadedList = [...unloaded.values()]
    .sort((a, b) => sortLabel(a.name, a.guid).localeCompare(sortLabel(b.name, b.guid)))
    .map((row) => ({
      guid: row.guid,
      name: row.name ?? null,
      fileCount: row.fileCount ?? null,
    }));

  return {
    generatedAt: new Date().toISOString(),
    build: meta.build || null,
    version: meta.version || null,
    mainKey: meta.mainKey || null,
    dynamicKeys,
    unloaded: unloadedList,
  };
}

export function serializeMergedAesPayload(payload: MergedAesPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}
