import { ActivityType } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { readFileSync } from 'fs';
import { join } from 'path';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { warmupEmojis } from '#helpers/core/emojis.ts';
import { logEpicBackgroundBootSummary } from '#helpers/core/config/epicBackground.ts';

/**
 * Evento Ready - Se ejecuta cuando el bot está listo
 * Sistema de presencias dinámicas y estadísticas (basado en bot original pero optimizado)
 */

// Leer versión del package.json
let versionBot = '1.0.0';
try {
  const packagePath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
  versionBot = packageJson.version;
} catch (err) {
  log.bot.warn('No se pudo leer la versión del package.json');
}

// Variables globales para almacenar estadísticas
let estadisticas = {
  comandosTotales: 0,
  usuariosRegistrados: 0,
  totalUsuarios: 0,
  servidores: 0,
  lastUpdate: null as Date | null,
};

const event: BotEvent<'clientReady'> = {
  name: 'clientReady',
  once: true,
  
  async execute(client: ExtendedClient) {
    const user = client.user;
    
    if (!user) {
      log.bot.error('Client user no disponible');
      return;
    }
    
    // Configurar maxListeners para WebSocket shards (evita memory leak warnings)
    // Esto previene: "Possible AsyncEventEmitter memory leak detected"
    if (client.ws) {
      client.ws.setMaxListeners(20);
      
      // Configurar cada shard individual si existen
      client.ws.shards.forEach((shard) => {
        shard.setMaxListeners(20);
      });
      
      log.bot.debug({ shards: client.ws.shards.size }, 'WebSocket shards configurados');
    }
    
    // Esperar a que application esté disponible
    while (!client.application) {
      await new Promise(res => setTimeout(res, 100));
    }

    // Pre-cargar todos los emojis del bot (resuelve animados y de aplicación)
    await warmupEmojis(client);

    log.bot.info({
      tag: user.tag,
      id: user.id,
      guilds: client.guilds.cache.size,
    }, 'Bot iniciado correctamente');
    
    // ==================== FUNCIONES DE ESTADÍSTICAS ====================
    
    /**
     * Contar comandos totales incluyendo subcomandos y grupos
     */
    const contarComandos = (): number => {
      let totalComandos = 0;
      let totalSubcomandos = 0;
      let totalGrupos = 0;
      
      const comandosUnicos = new Map();
      client.commands.forEach((comando, nombre) => {
        const comandoNombre = comando.data?.name;
        if (comandoNombre && !comandosUnicos.has(comandoNombre)) {
          comandosUnicos.set(comandoNombre, comando);
        }
      });
      
      comandosUnicos.forEach((comando) => {
        totalComandos++;
        
        if (comando.data && comando.data.options && Array.isArray(comando.data.options)) {
          comando.data.options.forEach((opcion: any) => {
            let tipoReal = opcion.type;
            
            if (opcion.type === undefined) {
              if (opcion.options && Array.isArray(opcion.options) && opcion.options.length > 0) {
                tipoReal = 2; // SUB_COMMAND_GROUP
              } else {
                tipoReal = 1; // SUB_COMMAND
              }
            }
            
            if (tipoReal === 1) {
              totalSubcomandos++;
            } else if (tipoReal === 2) {
              totalGrupos++;
              if (opcion.options && Array.isArray(opcion.options)) {
                opcion.options.forEach((subOpcion: any) => {
                  const subTipoReal = subOpcion.type || 1;
                  if (subTipoReal === 1) {
                    totalSubcomandos++;
                  }
                });
              }
            }
          });
        }
      });

      return totalComandos + totalSubcomandos + totalGrupos;
    };
    
    /**
     * Obtener estadísticas de MongoDB (si está conectado)
     */
    const obtenerEstadisticasMongo = async (): Promise<number> => {
      try {
        const usuariosRegistrados = await UsuarioInfo.countDocuments({
          deviceAuths: { $exists: true, $not: { $size: 0 } },
        });
        return usuariosRegistrados;
      } catch (error) {
        log.database.error({ err: error }, 'Error al obtener estadísticas MongoDB');
        return 0;
      }
    };
    
    /**
     * Calcular total de usuarios en Discord
     */
    const obtenerUsuariosTotales = (): number => {
      return client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0);
    };
    
    /**
     * Actualizar todas las estadísticas
     */
    const actualizarEstadisticas = async (): Promise<void> => {
      try {
        estadisticas.comandosTotales = contarComandos();
        estadisticas.usuariosRegistrados = await obtenerEstadisticasMongo();
        estadisticas.totalUsuarios = obtenerUsuariosTotales();
        estadisticas.servidores = client.guilds.cache.size;
        estadisticas.lastUpdate = new Date();

        log.bot.debug({
          comandos: estadisticas.comandosTotales,
          usuarios: estadisticas.totalUsuarios.toLocaleString(),
          servidores: estadisticas.servidores,
        }, 'Estadísticas actualizadas');
      } catch (error) {
        log.bot.error({ err: error }, 'Error actualizando estadísticas');
      }
    };
    
    /**
     * Esperar conexión a MongoDB
     */
    const esperarMongo = (): Promise<void> => {
      return new Promise((resolve) => {
        if (client.mongo && (client.mongo as any).readyState === 1) {
          resolve();
        } else {
          // Esperar evento mongoConnected
          client.once('mongoConnected' as any, resolve);
        }
      });
    };
    
    // ==================== INICIALIZACIÓN ====================
    
    // Esperar MongoDB — taxis/autokick dependen de DB en runtime, no de stats
    log.bot.info('Esperando conexión a MongoDB...');
    await esperarMongo();
    log.database.info('Conexión MongoDB detectada, cargando estadísticas...');

    logEpicBackgroundBootSummary();

    // AutoKick, Taxis y TaxiPrem se inicializan en glow-core (servicio local).

    void actualizarEstadisticas().catch((error) => {
      log.bot.error({ err: error }, 'Error actualizando estadísticas iniciales');
    });

    try {
      const { startServerMemoryMonitor } = await import('#helpers/discord/dev/serverMemoryMonitor.ts');
      startServerMemoryMonitor(client);
    } catch (error) {
      log.bot.error({ err: error }, 'Error iniciando monitor de RAM del servidor');
    }
    
    // ==================== SISTEMA GIVEAWAYS ====================

    // Recuperar sorteos activos después de MongoDB
    try {
      log.bot.info('Inicializando sistema Giveaways...');
      const { initGiveaways } = await import('../guild/community/giveawayHandler.ts');
      await initGiveaways(client);
      log.bot.info('Sistema Giveaways inicializado correctamente');
    } catch (error) {
      log.bot.error({ err: error }, 'Error inicializando Giveaways');
    }

    // Actualizar estadísticas cada hora
    const statsInterval = setInterval(async () => {
      await actualizarEstadisticas();
      
      // Forzar garbage collection si está disponible
      if (global.gc) {
        global.gc();
        log.bot.debug('Garbage collection ejecutada');
      }
    }, 60 * 60 * 1000); // 1 hora
    
    // ==================== SISTEMA DE PRESENCIAS DINÁMICAS ====================
    
    const presencias = [
      {
        name: `v${versionBot}`,
        type: ActivityType.Custom,
      },
      {
        name: '/help /support /invite-bot',
        type: ActivityType.Custom,
      },
      {
        dynamic: true,
        type: ActivityType.Custom,
        getName: () => `${estadisticas.comandosTotales} commands!`,
      },
      {
        dynamic: true,
        type: ActivityType.Custom,
        getName: () => `${estadisticas.usuariosRegistrados} registered!`,
      },
      {
        dynamic: true,
        type: ActivityType.Custom,
        getName: () => `${estadisticas.totalUsuarios.toLocaleString()} users!`,
      },
      {
        dynamic: true,
        type: ActivityType.Custom,
        getName: () => `${estadisticas.servidores} servers!`,
      },
      {
        name: 'first security, next victory royale!',
        type: ActivityType.Custom,
      },
      {
        name: 'discord.gg/tR7XTnRnrD',
        type: ActivityType.Custom,
      },
    ];

    let presenciaIndex = 0;

    /**
     * Establecer presencia actual
     */
    const setPresencia = async (): Promise<void> => {
      const presenciaObj = presencias[presenciaIndex % presencias.length];
      const presenciaName = (presenciaObj as any).dynamic 
        ? (presenciaObj as any).getName() 
        : presenciaObj.name;
      
      try {
        await user.setPresence({
          activities: [{
            name: presenciaName,
            type: presenciaObj.type,
          }],
          status: 'online',
        });
        
        presenciaIndex++;
      } catch (err) {
        log.bot.warn({ err }, 'Error cambiando presencia');
      }
    };

    // Presencia inicial
    await setPresencia();

    // Cambio de presencias cada 10 segundos
    const presenceInterval = setInterval(async () => {
      await setPresencia();
    }, 10000); // 10 segundos

    // ==================== LIMPIEZA EN SHUTDOWN ====================
    
    (client as any).once('destroy', () => {
      clearInterval(presenceInterval);
      clearInterval(statsInterval);
      log.bot.info('Intervalos de ready limpiados');
    });
    
    log.bot.info({
      comandos: estadisticas.comandosTotales,
      tag: user.tag,
    }, 'Sistema de presencias y estadísticas iniciado');
  },
};

export default event;
