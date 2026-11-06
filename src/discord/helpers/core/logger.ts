import { pino } from 'pino';
import type { Logger, LoggerOptions } from 'pino';

/**
 * Configuración ultra-ligera de Pino
 * - Pino es 5x más rápido que Winston y usa menos memoria
 * - Deshabilitamos características innecesarias para máximo rendimiento
 */

const isProduction = process.env.NODE_ENV === 'production';

// Opciones base optimizadas para bajo consumo
const baseOptions: LoggerOptions = {
  // En producción: nivel info, en desarrollo: debug
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  
  // Deshabilitar timestamp en producción para menor overhead
  // En desarrollo lo mantenemos para debugging
  timestamp: isProduction ? false : pino.stdTimeFunctions.isoTime,
  
  // Formatters mínimos - solo lo necesario
  formatters: {
    level: (label) => ({ level: label }),
  },
  
  // Deshabilitar características que consumen memoria
  base: undefined, // No incluir pid, hostname por defecto
  
  // Usar serializers solo cuando sea necesario
  serializers: {
    err: pino.stdSerializers.err,
  },
};

// Transport para desarrollo (más legible pero más lento)
const devTransport = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'HH:MM:ss',
    ignore: 'pid,hostname',
    singleLine: true,
  },
};

/**
 * Crear logger principal
 * En producción: salida JSON directa (más rápido)
 * En desarrollo: pino-pretty para legibilidad
 */
const createLogger = (): Logger => {
  if (isProduction) {
    return pino(baseOptions);
  }
  
  // En desarrollo usamos pino-pretty si está disponible
  try {
    return pino({
      ...baseOptions,
      transport: devTransport,
    });
  } catch {
    // Fallback si pino-pretty no está instalado
    return pino(baseOptions);
  }
};

// Logger principal singleton - evita crear múltiples instancias
const logger = createLogger();

/**
 * Child loggers para diferentes módulos
 * Los child loggers son extremadamente eficientes en Pino
 * ya que reutilizan la configuración del padre
 */
export const log = {
  bot: logger.child({ module: 'BOT' }),
  commands: logger.child({ module: 'CMD' }),
  events: logger.child({ module: 'EVT' }),
  database: logger.child({ module: 'DB' }),
  api: logger.child({ module: 'API' }),
  epic: logger.child({ module: 'EPIC' }),
};

// Exportar logger base para casos especiales
export default logger;

// Tipo para los child loggers
export type ModuleLogger = typeof log.bot;
