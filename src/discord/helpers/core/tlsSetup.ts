import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import https from 'node:https';
import { basename, resolve } from 'path';

/** Repo root (certs + root .env) — Glow runs with cwd = apps/bots/glow. */
function getProjectRoot(): string {
  return resolve(process.cwd(), '..', '..', '..');
}

function isDevRuntime(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** Windows antivirus/proxy MITM: EXTRA_CA_CERTS alone often fails Discord gateway TLS. */
function shouldUseDevTlsBypass(): boolean {
  if (process.env.TLS_STRICT_DEV === '1') return false;
  if (process.env.TLS_INSECURE_DEV === '1') return true;
  return process.platform === 'win32';
}

function applyDevTlsBypass(): boolean {
  if (!shouldUseDevTlsBypass()) return false;

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  delete process.env.NODE_EXTRA_CA_CERTS;
  console.info('[TLS] Windows: verificación TLS desactivada (antivirus/proxy). TLS_STRICT_DEV=1 para forzar verificación.');
  return true;
}

function resolveCaPath(): string | null {
  if (process.platform !== 'win32') return null;

  const raw = process.env.EXTRA_CA_CERTS?.trim();
  if (!raw) return null;

  // Paths written for the old layout (certs/x.pem) also resolve to system/certs/x.pem.
  const direct = resolve(getProjectRoot(), raw);
  const moved = resolve(getProjectRoot(), 'system', 'certs', basename(raw));
  const abs = existsSync(direct) ? direct : moved;
  if (!existsSync(abs)) {
    console.warn(`[TLS] EXTRA_CA_CERTS no encontrado: ${abs}`);
    if (isDevRuntime()) {
      console.warn('[TLS] DEV: ejecuta "npm run certs:export" o define TLS_INSECURE_DEV=1 en .env');
    }
    return null;
  }

  return abs;
}

let cachedMongoTls: Record<string, unknown> | undefined;

/**
 * Configura NODE_EXTRA_CA_CERTS para Discord, npm, fetch, etc.
 * Debe llamarse antes de client.login() y antes de mongoose.connect().
 */
export function applyTlsConfiguration(): void {
  if (applyDevTlsBypass()) return;

  const caPath = resolveCaPath();
  if (!caPath) return;

  process.env.NODE_EXTRA_CA_CERTS = caPath;
  console.info(`[TLS] CA extra cargado: ${caPath}`);
}

/** Opciones TLS adicionales para mongoose (Atlas + CA de antivirus/proxy). */
export function getMongoTlsOptions(): Record<string, unknown> {
  if (cachedMongoTls !== undefined) return cachedMongoTls;

  if (shouldUseDevTlsBypass()) {
    cachedMongoTls = { tls: true, tlsAllowInvalidCertificates: true };
    return cachedMongoTls;
  }

  const caPath = resolveCaPath();
  cachedMongoTls = caPath ? { tls: true, tlsCAFile: caPath } : {};
  return cachedMongoTls;
}

/** HTTPS agent for axios/fetch on Windows dev or with EXTRA_CA_CERTS. */
export function createHttpsAgent(): https.Agent {
  if (shouldUseDevTlsBypass()) {
    return new https.Agent({ rejectUnauthorized: false });
  }

  const caPath = resolveCaPath();
  if (caPath) {
    return new https.Agent({ ca: readFileSync(caPath) });
  }

  return new https.Agent();
}
