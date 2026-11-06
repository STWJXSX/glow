/**
 * Remote commands — slash commands implemented by Glow Core (see api/glowCore.ts).
 *
 * The core publishes a manifest (command JSON + gate flags). The bot registers those commands with
 * Discord like local ones and runs the usual gates (blacklist, auth, premium, cooldown, defer).
 * Then, instead of executing, it hands the raw interaction to the core, which answers Discord.
 *
 * The last manifest is cached on disk: if the core is down when the bot boots, the commands stay
 * registered (re-registering without them would remove them from Discord for everyone).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { log } from '../helpers/core/logger.ts';
import { resolveGlowProjectRoot } from '../helpers/core/glowAssetPaths.ts';
import { translateForUser } from '../helpers/locales/index.ts';
import { fetchCoreManifest, forwardInteraction, isGlowCoreEnabled } from '../api/glowCore.ts';
import type { GlowCoreCommandManifest, GlowCoreManifest } from '../api/glowCoreProtocol.ts';
import type { Command } from '../structures/types.ts';

const RAW_TTL_MS = 30_000;

/** Raw INTERACTION_CREATE payloads of remote commands, captured by events/client/glowCoreRelay.ts. */
const rawInteractions = new Map<string, { raw: Record<string, unknown>; at: number }>();
const remoteCommandNames = new Set<string>();

function manifestCachePath(): string {
  return join(resolveGlowProjectRoot(), '.cache', 'glow-core-manifest.json');
}

function readCachedManifest(): GlowCoreManifest | null {
  try {
    const data = JSON.parse(readFileSync(manifestCachePath(), 'utf8')) as GlowCoreManifest;
    return data?.version === 1 && Array.isArray(data.commands) ? data : null;
  } catch {
    return null;
  }
}

function writeCachedManifest(manifest: GlowCoreManifest): void {
  try {
    const file = manifestCachePath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(manifest));
  } catch (err) {
    log.commands.warn({ err }, '[GlowCore] No se pudo guardar el manifest en caché');
  }
}

async function loadManifest(): Promise<GlowCoreManifest | null> {
  // Without a cached manifest, registering now would drop the remote commands from Discord:
  // give a core that is still starting up to a minute.
  const attempts = readCachedManifest() ? 3 : 30;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const manifest = await fetchCoreManifest();
      writeCachedManifest(manifest);
      return manifest;
    } catch (err) {
      if (attempt === attempts) {
        log.commands.warn({ err }, '[GlowCore] Manifest no disponible — usando la caché');
      } else {
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
  }
  return readCachedManifest();
}

export function isRemoteCommandName(name: string): boolean {
  return remoteCommandNames.has(name);
}

export function hasRemoteCommands(): boolean {
  return remoteCommandNames.size > 0;
}

export function storeRawInteraction(id: string, raw: Record<string, unknown>): void {
  const now = Date.now();
  rawInteractions.set(id, { raw, at: now });
  if (rawInteractions.size > 200) {
    for (const [key, value] of rawInteractions) {
      if (now - value.at > RAW_TTL_MS) rawInteractions.delete(key);
    }
  }
}

function takeRawInteraction(id: string): Record<string, unknown> | null {
  const entry = rawInteractions.get(id);
  rawInteractions.delete(id);
  return entry && Date.now() - entry.at <= RAW_TTL_MS ? entry.raw : null;
}

async function replyUnavailable(interaction: ChatInputCommandInteraction): Promise<void> {
  const content = await translateForUser(interaction.user.id, 'errors.command_error').catch(() => 'Error');
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content, embeds: [], components: [] }).catch(() => {});
  } else {
    await interaction.reply({ content, ephemeral: true }).catch(() => {});
  }
}

function buildRemoteCommand(entry: GlowCoreCommandManifest): Command {
  const json = entry.json;
  const name = String(json.name);
  // Same surface the loader and /help read from a SlashCommandBuilder.
  const data = { ...json, name, toJSON: () => json } as unknown as Command['data'];

  const command: Command = {
    ...entry.flags,
    automationSystem: entry.flags.automationSystem as Command['automationSystem'],
    data,
    onlyslash: true,
    async execute(interaction: ChatInputCommandInteraction) {
      const raw = takeRawInteraction(interaction.id);
      if (!raw) {
        log.commands.warn({ command: name }, '[GlowCore] Interacción sin payload raw');
        await replyUnavailable(interaction);
        return;
      }
      try {
        await forwardInteraction({
          raw,
          deferred: interaction.deferred,
          ephemeral: Boolean(interaction.ephemeral),
        });
      } catch (err) {
        log.commands.error({ err, command: name }, '[GlowCore] No se pudo reenviar el comando');
        await replyUnavailable(interaction);
      }
    },
  };

  if (entry.hasAutocomplete) {
    command.autocomplete = async (interaction: AutocompleteInteraction) => {
      const raw = takeRawInteraction(interaction.id);
      if (!raw) {
        await interaction.respond([]).catch(() => {});
        return;
      }
      await forwardInteraction({ raw, deferred: false, ephemeral: false }).catch(async () => {
        await interaction.respond([]).catch(() => {});
      });
    };
  }

  return command;
}

let retryTimer: NodeJS.Timeout | null = null;

/**
 * Core configured but no manifest yet (first boot, core still starting): poll it and run onReady
 * once it answers, so the remote commands get registered without a restart.
 */
export function scheduleManifestRetry(onReady: () => Promise<unknown>): void {
  if (retryTimer || !isGlowCoreEnabled()) return;
  let attempts = 0;
  retryTimer = setInterval(async () => {
    attempts++;
    try {
      writeCachedManifest(await fetchCoreManifest());
    } catch {
      if (attempts >= 40) {
        clearInterval(retryTimer!);
        retryTimer = null;
        log.commands.error('[GlowCore] Core sin responder tras 10 min — comandos remotos sin registrar');
      }
      return;
    }
    clearInterval(retryTimer!);
    retryTimer = null;
    log.commands.info('[GlowCore] Core disponible — recargando comandos');
    await onReady().catch((err) => log.commands.error({ err }, '[GlowCore] Error recargando comandos'));
  }, 15_000);
}

/** Commands published by Glow Core, ready to be added to client.commands. Empty when disabled. */
export async function loadRemoteCommands(localNames: Set<string>): Promise<Command[]> {
  remoteCommandNames.clear();
  if (!isGlowCoreEnabled()) return [];

  const manifest = await loadManifest();
  if (!manifest) {
    log.commands.warn('[GlowCore] Sin manifest (core caído y sin caché) — comandos remotos no registrados');
    return [];
  }

  const commands: Command[] = [];
  for (const entry of manifest.commands) {
    const name = String(entry.json?.name ?? '');
    if (!name) continue;
    if (localNames.has(name)) {
      log.commands.warn({ command: name }, '[GlowCore] Comando remoto ignorado: ya existe uno local');
      continue;
    }
    remoteCommandNames.add(name);
    commands.push(buildRemoteCommand(entry));
  }

  log.commands.info({ count: commands.length }, '[GlowCore] Comandos remotos cargados');
  return commands;
}
