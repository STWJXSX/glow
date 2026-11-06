import { readdirSync } from 'fs';
import { basename, join, sep } from 'path';
import { log } from '../helpers/core/logger.ts';
import { isEpicBackgroundEventEnabled } from '../helpers/core/config/epicBackground.ts';
import { waitForMongoConnected } from '../events/db/mongodb.ts';
import { clearModuleCache, importSourceModule } from './importSourceModule.ts';
import type { ExtendedClient, BotEvent } from '../structures/types.ts';

const MONGO_GATED_EVENTS = new Set(['ready', 'clientReady']);

/** discord.js 14.14+ renamed Ready → clientReady; legacy event files still use 'ready'. */
function resolveEventName(name: string): string {
  return name === 'ready' ? 'clientReady' : name;
}

/** Modules under events/ that are imported manually — not BotEvent exports. */
const SKIPPED_EVENT_BASENAMES = new Set([
  'autokickmonitor.js',
  'autokickmonitor.ts',
  'serverconfig.js',
  'serverconfig.ts',
  'premiuminfocontent.js',
  'premiuminfocontent.ts',
  'premiuminfolocales.json',
  'premiumtierstablegenerator.js',
  'premiumtierstablegenerator.ts',
  'premiumtierstablebuilder.js',
  'premiumtierstablebuilder.ts',
  'premiumtierstablelocales.json',
]);

function shouldSkipEventFile(filePath: string): boolean {
  const base = basename(filePath).toLowerCase();
  if (SKIPPED_EVENT_BASENAMES.has(base)) return true;
  if (filePath.includes('mongodb')) return true;

  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/taxi')) return true;
  if (normalized.includes('shopworker')) return true;
  return false;
}

/**
 * Obtiene todos los archivos de eventos recursivamente
 * Usa iteración para menor uso de memoria del stack
 */
function getEventFiles(dir: string): string[] {
  const results: string[] = [];
  const stack: string[] = [dir];
  
  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
          if (!entry.name.endsWith('.d.ts')) {
            results.push(fullPath);
          }
        }
      }
    } catch (err) {
      log.events.warn({ dir: currentDir, err }, 'Error leyendo directorio');
    }
  }
  
  return results;
}

/**
 * Carga y registra eventos de forma eficiente
 */
export async function loadEvents(client: ExtendedClient): Promise<void> {
  // Remover todos los listeners existentes para evitar duplicados
  // Esto es importante para hot-reloading
  client.removeAllListeners();
  
  const eventsPath = join((import.meta.dirname ?? __dirname), '..', 'events');
  const eventFiles = getEventFiles(eventsPath);
  const epicEventsPath = join(eventsPath, 'epic');
  
  let loaded = 0;
  let failed = 0;
  let readyRemapped = 0;
  let skippedEpicBackground = 0;
  
  for (const filePath of eventFiles) {
    try {
      // Saltar archivos que se cargan manualmente o son sistemas independientes
      if (shouldSkipEventFile(filePath)) {
        continue;
      }

      if (filePath.startsWith(`${epicEventsPath}${sep}`) && !isEpicBackgroundEventEnabled(filePath)) {
        skippedEpicBackground++;
        continue;
      }
      
      clearModuleCache(filePath);

      const eventModule = await importSourceModule<{ default?: BotEvent } & BotEvent>(filePath);
      const event: BotEvent = eventModule.default || eventModule;
      
      // Validación mínima
      if (!event?.name || typeof event.execute !== 'function') {
        log.events.warn({ file: filePath }, 'Evento inválido, saltando');
        failed++;
        continue;
      }
      
      const resolvedName = resolveEventName(event.name);
      if (event.name === 'ready') readyRemapped++;

      const runEvent = async (...args: any[]) => {
        try {
          if (MONGO_GATED_EVENTS.has(event.name) || MONGO_GATED_EVENTS.has(resolvedName)) {
            await waitForMongoConnected(client);
          }
          await event.execute(client, ...(args as any));
        } catch (err) {
          log.events.error({ event: event.name, err }, 'Error ejecutando evento');
        }
      };

      // Registrar evento con binding correcto
      if (event.once) {
        (client as any).once(resolvedName, (...args: any[]) => void runEvent(...args));
      } else {
        (client as any).on(resolvedName, (...args: any[]) => void runEvent(...args));
      }
      
      loaded++;
    } catch (err) {
      log.events.error({ file: filePath, err }, 'Error cargando evento');
      failed++;
    }
  }
  
  if (readyRemapped > 0) {
    log.events.info(
      { count: readyRemapped },
      'Eventos legacy "ready" registrados como "clientReady" (discord.js 14.14+)',
    );
  }

  log.events.info({ loaded, failed, skippedEpicBackground }, 'Eventos registrados');
}

export default loadEvents;
