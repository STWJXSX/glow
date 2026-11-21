import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { finished } from 'stream/promises';

import axios from 'axios';

import { Manifest } from './parser/objects/Manifest.ts';
import { ManifestOptions } from './parser/objects/ManifestOptions.ts';
import type { FileManifest } from './parser/objects/FileManifest.ts';
import { log } from '#helpers/core/logger.ts';

export interface ManifestPakDownloadResult {
  ok: number;
  skip: number;
  err: number;
  missing: string[];
}

export interface ManifestPakDownloadOptions {
  destDir: string;
  manifestUrl: string;
  chunkBaseUrl: string;
  build: string;
  fileNames: readonly string[];
  logLabel?: string;
  userAgent?: string;
  onFileProgress?: (progress: {
    fileName: string;
    fileIndex: number;
    fileTotal: number;
    fileBytesTotal: number;
    partBytes: number;
  }) => void;
}

export interface ParsedLauncherManifest {
  manifest: Manifest;
  chunkBaseUri: string;
  options: ManifestOptions;
}

const MAX_FILE_ATTEMPTS = 3;
const PAKS_PATH_MARKER = '/FortniteGame/Content/Paks/';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildChunkBaseUri(chunkBaseUrl: string, manifest: Manifest): string {
  const base = chunkBaseUrl.replace(/\/$/, '');
  return `${base}/${manifest.getChunkSubdir()}/`;
}

export function isFileComplete(destPath: string, expectedSize: number): boolean {
  if (!fs.existsSync(destPath)) return false;
  const size = fs.statSync(destPath).size;
  return size > 0 && (expectedSize <= 0 || size === expectedSize);
}

function findManifestFileByName(manifest: Manifest, fileName: string): FileManifest | undefined {
  const suffix = `${PAKS_PATH_MARKER}${fileName}`;
  const trimmed = suffix.replace(/^\//, '');
  return manifest.FileManifestList.find(
    (file) => file.Name.endsWith(suffix) || file.Name.endsWith(trimmed),
  );
}

async function writeFileParts(
  file: FileManifest,
  tmpPath: string,
  onPartWritten?: (partBytes: number) => void,
): Promise<void> {
  const stream = createWriteStream(tmpPath);
  let written = 0;

  try {
    for (const chunk of file.Chunks) {
      const data = await chunk.loadData();
      written += data.length;
      if (onPartWritten) onPartWritten(written);
      if (!stream.write(data)) {
        await new Promise<void>((resolve) => stream.once('drain', resolve));
      }
    }
    stream.end();
    await finished(stream);
  } catch (err) {
    stream.destroy();
    throw err;
  }
}

async function saveManifestFile(
  file: FileManifest,
  destPath: string,
  onPartWritten?: (partBytes: number) => void,
): Promise<void> {
  const tmpPath = `${destPath}.part`;
  if (fs.existsSync(tmpPath)) {
    fs.unlinkSync(tmpPath);
  }

  await writeFileParts(file, tmpPath, onPartWritten);

  const stat = fs.statSync(tmpPath);
  if (file.Size > 0 && stat.size !== file.Size) {
    fs.unlinkSync(tmpPath);
    throw new Error(`Size mismatch (${stat.size} != ${file.Size})`);
  }

  if (fs.existsSync(destPath)) {
    fs.unlinkSync(destPath);
  }
  fs.renameSync(tmpPath, destPath);
}

export async function parseLauncherManifest(
  destDir: string,
  manifestUrl: string,
  chunkBaseUrl: string,
  userAgent = 'GlowManifestPakDownloader/1.0',
): Promise<ParsedLauncherManifest> {
  fs.mkdirSync(destDir, { recursive: true });

  const chunkCacheDir = path.join(destDir, '.chunk-cache');
  fs.mkdirSync(chunkCacheDir, { recursive: true });

  const manifestRes = await axios.get<ArrayBuffer>(manifestUrl, {
    responseType: 'arraybuffer',
    timeout: 120_000,
    maxRedirects: 8,
    headers: { 'User-Agent': userAgent },
    validateStatus: (status) => status < 500,
  });

  if (manifestRes.status !== 200 || !manifestRes.data) {
    throw new Error(`Manifest download failed (${manifestRes.status})`);
  }

  const manifestBytes = Buffer.from(manifestRes.data);
  const options = new ManifestOptions({
    cacheDirectory: chunkCacheDir,
    lazy: true,
  });
  const manifest = new Manifest(manifestBytes, options);
  options.chunkBaseUri = buildChunkBaseUri(chunkBaseUrl, manifest);

  return { manifest, chunkBaseUri: options.chunkBaseUri, options };
}

export function listPakFileNamesFromManifest(
  manifest: Manifest,
  filter: (fileName: string) => boolean,
): string[] {
  const names = new Set<string>();

  for (const file of manifest.FileManifestList) {
    if (!file.Name.includes(PAKS_PATH_MARKER)) continue;
    const fileName = path.basename(file.Name);
    if (filter(fileName)) names.add(fileName);
  }

  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export async function downloadManifestPakFiles(
  options: ManifestPakDownloadOptions,
): Promise<ManifestPakDownloadResult> {
  const {
    destDir,
    manifestUrl,
    chunkBaseUrl,
    build,
    fileNames,
    logLabel = 'PAKS',
    userAgent = 'GlowManifestPakDownloader/1.0',
    onFileProgress,
  } = options;

  fs.mkdirSync(destDir, { recursive: true });

  log.epic.info(`[${logLabel}] Downloading manifest: ${manifestUrl}`);

  const parsed = await parseLauncherManifest(destDir, manifestUrl, chunkBaseUrl, userAgent);
  const { manifest } = parsed;

  log.epic.info(
    `[${logLabel}] Manifest parsed · build ${build} · chunk base ${parsed.chunkBaseUri} · files ${manifest.FileManifestList.length.toLocaleString()}`,
  );

  let ok = 0;
  let skip = 0;
  let err = 0;
  const fileTotal = fileNames.length;

  for (let fileIndex = 0; fileIndex < fileNames.length; fileIndex += 1) {
    const fileName = fileNames[fileIndex]!;
    const destPath = path.join(destDir, fileName);
    const partPath = `${destPath}.part`;

    const fileManifest = findManifestFileByName(manifest, fileName);
    if (!fileManifest) {
      err += 1;
      log.epic.warn(`[${logLabel}] Not in manifest: ${fileName}`);
      continue;
    }

    if (isFileComplete(destPath, fileManifest.Size)) {
      skip += 1;
      continue;
    }

    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
    if (fs.existsSync(partPath)) {
      fs.unlinkSync(partPath);
    }

    onFileProgress?.({
      fileName,
      fileIndex: fileIndex + 1,
      fileTotal,
      fileBytesTotal: fileManifest.Size,
      partBytes: 0,
    });

    let saved = false;
    let lastError = 'unknown error';

    for (let attempt = 1; attempt <= MAX_FILE_ATTEMPTS; attempt += 1) {
      try {
        log.epic.info(
          `[${logLabel}] Downloading ${fileName} (${fileManifest.Size.toLocaleString()} bytes)${attempt > 1 ? ` · retry ${attempt}/${MAX_FILE_ATTEMPTS}` : ''}...`,
        );
        await saveManifestFile(fileManifest, destPath, (partBytes) => {
          onFileProgress?.({
            fileName,
            fileIndex: fileIndex + 1,
            fileTotal,
            fileBytesTotal: fileManifest.Size,
            partBytes,
          });
        });
        saved = true;
        ok += 1;
        break;
      } catch (downloadErr: unknown) {
        lastError = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
        log.epic.warn(`[${logLabel}] ${fileName} attempt ${attempt}: ${lastError}`);
        if (fs.existsSync(partPath)) {
          fs.unlinkSync(partPath);
        }
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        if (attempt < MAX_FILE_ATTEMPTS) {
          await sleep(1500 * attempt);
        }
      }
    }

    if (!saved) {
      err += 1;
      log.epic.warn(`[${logLabel}] ${fileName}: failed after ${MAX_FILE_ATTEMPTS} attempts · ${lastError}`);
    }
  }

  const missing = fileNames.filter((name) => !isFileComplete(path.join(destDir, name), 0));

  log.epic.info(`[${logLabel}] Pak download finished · ok ${ok} · skip ${skip} · err ${err} → ${destDir}`);

  if (missing.length > 0) {
    throw new Error(`Pak download incomplete · missing: ${missing.join(', ')}`);
  }

  return { ok, skip, err, missing };
}
