import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * Cloudflare R2 temp uploads (S3-compatible).
 *
 * Env:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 *   R2_PUBLIC_BASE_URL   e.g. https://tmp.glowhaven.site
 */

export interface R2TempUploadOptions {
  /** Object key prefix. Default: locker */
  prefix?: string;
  contentType?: string;
  /** Default: public, max-age=3600 */
  cacheControl?: string;
}

let r2Client: S3Client | null = null;

export function isR2TempUploadConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim()
    && process.env.R2_ACCESS_KEY_ID?.trim()
    && process.env.R2_SECRET_ACCESS_KEY?.trim()
    && process.env.R2_BUCKET?.trim()
    && process.env.R2_PUBLIC_BASE_URL?.trim(),
  );
}

function getR2Client(): S3Client {
  const accountId = normalizeR2AccountId(process.env.R2_ACCOUNT_ID?.trim() ?? '');
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 temp upload is not configured');
  }

  if (!r2Client) {
    const endpoint = process.env.R2_S3_ENDPOINT?.trim().replace(/\/+$/, '')
      ?? `https://${accountId}.r2.cloudflarestorage.com`;
    r2Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  return r2Client;
}

function normalizeR2AccountId(raw: string): string {
  const value = raw.trim();
  const hostMatch = value.match(/([a-f0-9]{32})\.r2\.cloudflarestorage\.com/i);
  if (hostMatch) return hostMatch[1]!;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    const host = new URL(value).hostname;
    const fromUrl = host.match(/^([a-f0-9]{32})\.r2\.cloudflarestorage\.com$/i);
    if (fromUrl) return fromUrl[1]!;
  }
  return value.replace(/[^a-f0-9]/gi, '');
}

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'image.webp';
}

function resolveContentType(fileName: string, override?: string): string {
  if (override) return override;

  switch (path.extname(fileName).toLowerCase()) {
    case '.webp':
      return 'image/webp';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

function buildPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL!.trim().replace(/\/+$/, '');
  const encodedKey = key.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `${base}/${encodedKey}`;
}

/**
 * Upload buffer to R2 and return public HTTPS URL.
 * Objects should be auto-deleted via R2 lifecycle rules on the bucket prefix.
 */
export async function uploadTempImageToR2(
  buffer: Buffer,
  fileName: string,
  options: R2TempUploadOptions = {},
): Promise<string> {
  if (!isR2TempUploadConfigured()) {
    throw new Error('R2 temp upload is not configured');
  }

  const bucket = process.env.R2_BUCKET!.trim();
  const safeName = sanitizeFileName(fileName);
  const prefix = (options.prefix ?? 'locker').replace(/^\/+|\/+$/g, '');
  const key = `${prefix}/${randomUUID()}-${safeName}`;

  await getR2Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: resolveContentType(safeName, options.contentType),
    CacheControl: options.cacheControl ?? 'public, max-age=3600',
  }));

  return buildPublicUrl(key);
}
