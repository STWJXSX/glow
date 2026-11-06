import { Collection, REST, Routes, PermissionFlagsBits } from 'discord.js';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { log } from '../helpers/core/logger.ts';
import {
  isPremiumProductCommandName,
  shouldRegisterPremiumProductCommands,
} from '../helpers/core/client/premium.ts';
import { getSupportServerId } from '../helpers/discord/dev/devAuth.ts';
import { clearModuleCache, importSourceModule } from './importSourceModule.ts';
import { loadRemoteCommands, scheduleManifestRetry } from './remoteCommands.ts';
import type { ExtendedClient, Command } from '../structures/types.ts';

export interface CommandReloadResult {
  success: boolean;
  loaded: number;
  failed: number;
  publicCommands: number;
  devCommands: number;
  registeredPublic: boolean;
  registeredDev: boolean;
  globalRegistration: boolean;
  errors: string[];
  durationMs: number;
}

interface RegisterResult {
  ok: boolean;
  count: number;
  global: boolean;
  error?: string;
}

/** Unique commands by canonical slash name (collection also keys localized aliases). */
export function forEachUniqueCommand(
  client: ExtendedClient,
  fn: (command: Command, canonicalName: string) => void,
): void {
  const seen = new Set<string>();

  for (const command of client.commands.values()) {
    const canonicalName = command.data?.name;
    if (!canonicalName || seen.has(canonicalName)) continue;
    seen.add(canonicalName);
    fn(command, canonicalName);
  }
}

export function getUniqueCommands(client: ExtendedClient): Command[] {
  const commands: Command[] = [];
  forEachUniqueCommand(client, (command) => commands.push(command));
  return commands;
}

/**
 * Obtiene todos los archivos de comandos recursivamente
 * Usa iteración en lugar de recursión para menor uso de stack
 */
function getCommandFiles(dir: string): string[] {
  const results: string[] = [];
  const stack: string[] = [dir];
  
  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          if (entry.name === '_disabled') continue;
          stack.push(fullPath);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
          // Ignorar archivos de definición de tipos y comandos deshabilitados
          if (!entry.name.endsWith('.d.ts') && !entry.name.includes('.disabled')) {
            results.push(fullPath);
          }
        }
      }
    } catch (err) {
      log.commands.warn({ dir: currentDir, err }, 'Error leyendo directorio');
    }
  }
  
  return results;
}

/**
 * Recarga comandos en memoria y los vuelve a registrar en Discord REST.
 */
export async function reloadCommands(client: ExtendedClient): Promise<CommandReloadResult> {
  const startedAt = Date.now();
  const errors: string[] = [];

  client.commands.clear();

  const commandsPath = join((import.meta.dirname ?? __dirname), '..', 'commands');
  const commandFiles = getCommandFiles(commandsPath);
  const publicCommands: object[] = [];
  const devCommands: object[] = [];

  const addCommand = (command: Command): void => {
    client.commands.set(command.data.name, command);

    const json = command.data.toJSON();
    for (const localizedName of Object.values((json as { name_localizations?: Record<string, string> }).name_localizations ?? {})) {
      if (localizedName && localizedName !== command.data.name) {
        client.commands.set(localizedName, command);
      }
    }
    if (command.devOnly) {
      if (command.devAccess) managerDevCommandNames.add(command.data.name);
      devCommands.push(json);
    } else {
      publicCommands.push(json);
    }
  };

  let loaded = 0;
  let failed = 0;

  for (const filePath of commandFiles) {
    try {
      clearModuleCache(filePath);

      const commandModule = await importSourceModule<{ default?: Command } & Command>(filePath);
      const command: Command = commandModule.default || commandModule;

      if (!command?.data?.name || typeof command.execute !== 'function') {
        log.commands.warn({ file: filePath }, 'Comando inválido, saltando');
        failed++;
        continue;
      }

      if (
        !shouldRegisterPremiumProductCommands()
        && isPremiumProductCommandName(command.data.name)
      ) {
        log.commands.info(
          { command: command.data.name },
          'Comando premium omitido (monetización desactivada)',
        );
        continue;
      }

      addCommand(command);
      loaded++;
    } catch (err) {
      log.commands.error({ file: filePath, err }, 'Error cargando comando');
      failed++;
    }
  }

  // Commands served by Glow Core (local API) — registered like local ones, executed remotely.
  const localNames = new Set(getUniqueCommands(client).map((c) => c.data.name));
  const remoteCommands = await loadRemoteCommands(localNames);
  for (const command of remoteCommands) {
    if (!shouldRegisterPremiumProductCommands() && isPremiumProductCommandName(command.data.name)) continue;
    addCommand(command);
    loaded++;
  }
  if (remoteCommands.length === 0) scheduleManifestRetry(() => reloadCommands(client));

  log.commands.info({ loaded, failed, dev: devCommands.length }, 'Comandos cargados en memoria');

  const publicResult = await registerCommands(client, publicCommands);
  const devResult = await registerDevCommands(client, devCommands);

  if (!publicResult.ok && publicResult.error) {
    errors.push(publicResult.error);
  }
  if (!devResult.ok && devResult.error) {
    errors.push(devResult.error);
  }

  const result: CommandReloadResult = {
    success: failed === 0 && publicResult.ok && devResult.ok,
    loaded,
    failed,
    publicCommands: publicCommands.length,
    devCommands: devCommands.length,
    registeredPublic: publicResult.ok,
    registeredDev: devResult.ok,
    globalRegistration: publicResult.global,
    errors,
    durationMs: Date.now() - startedAt,
  };

  log.commands.info(result, 'Recarga de comandos completada');
  return result;
}

/** Carga comandos al arrancar el bot (alias de reloadCommands). */
export async function loadCommands(client: ExtendedClient): Promise<void> {
  await reloadCommands(client);
}

/**
 * Registra comandos públicos en Discord API
 */
async function registerCommands(client: ExtendedClient, commands: object[]): Promise<RegisterResult> {
  if (commands.length === 0) {
    log.commands.warn('No hay comandos para registrar');
    return { ok: true, count: 0, global: false };
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const token = isDev ? process.env.DISCORD_TOKEN : process.env.DISCORD_TOKEN_PROD;
  const clientId = client.application?.id;

  if (!token || !clientId) {
    const error = 'Token o Client ID no disponible';
    log.commands.error(error);
    return { ok: false, count: commands.length, global: !isDev, error };
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    const guildId = isDev ? process.env.DEV_GUILD_ID : undefined;

    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId);

    const commandsWithIntegration = commands.map((c: any) => ({
      ...c,
      integration_types: [0, 1],
      contexts: [0, 1, 2],
    }));

    await rest.put(route, { body: commandsWithIntegration });

    log.commands.info(
      { count: commands.length, global: !guildId },
      'Comandos registrados en Discord',
    );

    return { ok: true, count: commands.length, global: !guildId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.commands.error({ err }, 'Error registrando comandos en Discord');
    return { ok: false, count: commands.length, global: !isDev, error: message };
  }
}

/** Dev commands that non-admin team members may run (runtime check in interactionCreate). */
const managerDevCommandNames = new Set<string>();

/**
 * Dev commands: guild-only on support server, no DMs, admin-visible (runtime: DEVELOPER_IDS).
 * Commands with `devAccess` are visible to everyone in that server — the runtime check still blocks
 * anyone who is not allowed.
 */
async function registerDevCommands(client: ExtendedClient, commands: object[]): Promise<RegisterResult> {
  if (commands.length === 0) {
    return { ok: true, count: 0, global: false };
  }

  const supportGuildId = getSupportServerId();
  if (!supportGuildId) {
    const error = 'SUPPORT_SERVER no configurado — dev commands no registrados';
    log.commands.warn(error);
    return { ok: false, count: commands.length, global: false, error };
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const token = isDev ? process.env.DISCORD_TOKEN : process.env.DISCORD_TOKEN_PROD;
  const clientId = client.application?.id;

  if (!token || !clientId) {
    const error = 'Token o Client ID no disponible para dev commands';
    log.commands.error(error);
    return { ok: false, count: commands.length, global: false, error };
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const body = commands.map((c: object) => ({
    ...c,
    dm_permission: false,
    default_member_permissions: managerDevCommandNames.has((c as { name: string }).name)
      ? null
      : String(PermissionFlagsBits.Administrator),
    integration_types: [0],
    contexts: [0],
  }));

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, supportGuildId), { body });
    log.commands.info({ count: commands.length, guildId: supportGuildId }, 'Dev commands registrados (support guild)');
    return { ok: true, count: commands.length, global: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.commands.error({ err }, 'Error registrando dev commands');
    return { ok: false, count: commands.length, global: false, error: message };
  }
}

export default loadCommands;
