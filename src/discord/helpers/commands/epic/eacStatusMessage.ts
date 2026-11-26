/**
 * Renders /eac from the snapshot stored by the core's EAC monitor.
 * The status data is fetched through Glow Core; only the presentation lives here.
 */

import path from 'path';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { resolveGlowProjectRoot } from '#helpers/core/glowAssetPaths.ts';
import { translate, type SupportedLanguage } from '#helpers/locales/index.ts';

export interface EacStatusFile {
  path: string;
  size: number;
  version: string | null;
  builtAt?: string | null;
  signer?: string | null;
  signedAt?: string | null;
}

export interface EacStatusVersion {
  key: string;
  files: EacStatusFile[];
}

export interface EacStatus {
  latestKey: string | null;
  checkedAt: string | null;
  trackedSince: { key: string; detectedAt: string } | null;
  version: EacStatusVersion | null;
  history: { key: string; build: string; detectedAt: string; changed: boolean }[];
}

const EAC_COLOR = 0x3b82f6;
const LOGO_FILE = 'eac-eos.png';
const SETUP_EXE = 'easyanticheat_eos_setup.exe';
const STATUS_HISTORY = 5;

const tr = (lang: SupportedLanguage, key: string, vars?: Record<string, string | number>) =>
  translate(`eacFeed.${key}`, lang, vars);

function fmtMb(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 0.1) return `${mb.toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function fmtDate(iso: string | null | undefined, lang: SupportedLanguage): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

const fileName = (p: string) => p.split('/').pop()!;

/** "43.00-CL-59596594" → "v43.00 · CL 59596594" */
function buildLabel(key: string): string {
  const m = key.match(/^([\d.]+)-CL-(\d+)$/);
  return m ? `v${m[1]} · CL ${m[2]}` : key;
}

/** Underlined title with every line quoted; multi-line entries stay inside the quote. */
function section(title: string, lines: (string | null)[]): string | null {
  const body = lines.filter((l): l is string => l !== null);
  if (!body.length) return null;
  return [`__**${title}**__`, ...body.flatMap((l) => l.split('\n')).map((l) => `> ${l}`)].join('\n');
}

/** Version, build date and signature of one binary. */
function binaryLines(
  label: string,
  version: EacStatusVersion,
  match: (p: string) => boolean,
  lang: SupportedLanguage,
): string[] {
  const file = version.files.find((f) => match(f.path));
  if (!file?.version) return [];
  const versionText = `\`${file.version}\``;

  const built = fmtDate(file.builtAt, lang);
  const signed = fmtDate(file.signedAt, lang);
  const details = built && file.signer && signed
    ? tr(lang, 'builtSigned', { built, signer: file.signer, signed })
    : built ? tr(lang, 'built', { built }) : null;

  const lines = [`**${label}** ${versionText}`];
  if (details) lines.push(`-# ${details}`);
  return lines;
}

/** Current stored EAC state (what the monitor last saw), same look as the feed embed. */
export function buildEacStatusMessage(status: EacStatus, lang: SupportedLanguage) {
  const logo = new AttachmentBuilder(path.join(resolveGlowProjectRoot(), 'assets/icons/eac', LOGO_FILE), { name: LOGO_FILE });
  const embed = new EmbedBuilder()
    .setColor(EAC_COLOR)
    .setTitle(tr(lang, 'status.title'))
    .setThumbnail(`attachment://${LOGO_FILE}`);

  if (!status.latestKey || !status.version) {
    return { embeds: [embed.setDescription(tr(lang, 'status.empty'))], files: [logo] };
  }

  const { version } = status;
  const totalBytes = version.files.reduce((s, f) => s + f.size, 0);
  const checkedMs = status.checkedAt ? Date.parse(status.checkedAt) : NaN;
  const lastChange = status.history.find((h) => h.changed);
  const since = fmtDate(status.trackedSince?.detectedAt, lang);

  const recent = status.history.slice(0, STATUS_HISTORY).map((h) =>
    `\`${buildLabel(h.key)}\` · ${fmtDate(h.detectedAt, lang) ?? '?'} · ${tr(lang, h.changed ? 'status.changed' : 'status.same')}`);

  const sections = [
    section(tr(lang, 'fortnite'), [
      buildLabel(version.key),
      Number.isFinite(checkedMs) ? `-# ${tr(lang, 'status.checked', { time: `<t:${Math.floor(checkedMs / 1000)}:R>` })}` : null,
      since ? `-# ${tr(lang, 'status.since', { date: since })}` : null,
    ]),
    section(tr(lang, 'binaries'), [
      ...binaryLines(tr(lang, 'setup'), version, (p) => fileName(p).toLowerCase() === SETUP_EXE, lang),
      ...binaryLines(tr(lang, 'bootstrapper'), version, (p) => !p.includes('/') && /_eac.*\.exe$/i.test(p), lang),
      `**${tr(lang, 'files')}** ${tr(lang, 'status.filesTotal', { count: version.files.length, size: fmtMb(totalBytes) })}`,
    ]),
    section(tr(lang, 'status.lastChange'), [
      lastChange
        ? `\`${buildLabel(lastChange.key)}\` · ${fmtDate(lastChange.detectedAt, lang) ?? '?'}`
        : tr(lang, 'status.noChanges'),
    ]),
    recent.length ? section(tr(lang, 'status.recent'), recent) : null,
  ].filter((s): s is string => s !== null);

  return { embeds: [embed.setDescription(sections.join('\n\n'))], files: [logo] };
}
