/**
 * Source-relative paths that work when a module is loaded from an extension tree.
 *
 * Glow Core loads extra modules from its own folder, mirroring src/ (GLOW_EXTENSION_SRC). Those
 * modules still read data from the bot tree, so their import.meta.dirname is mapped back to the
 * matching folder under the bot's src/ (GLOW_BOT_SRC). Without those env vars it is a no-op.
 */

import path from 'node:path';

export function sourceDir(dirname: string): string {
  const extensionSrc = process.env.GLOW_EXTENSION_SRC;
  const botSrc = process.env.GLOW_BOT_SRC;
  if (!extensionSrc || !botSrc) return dirname;

  const rel = path.relative(extensionSrc, dirname);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return dirname;
  return path.join(botSrc, rel);
}
