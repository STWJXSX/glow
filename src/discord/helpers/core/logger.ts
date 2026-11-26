import { pino } from 'pino';
import type { Logger, LoggerOptions } from 'pino';

/**
 * Configuración ultra-ligera de Pino
 * - Pino es 5x más rápido que Winston y usa menos memoria
 * - Deshabilitamos características innecesarias para máximo rendimiento
 */

const isProduction = process.env.NODE_ENV === 'production';

const SENSITIVE_FIELD_RE = /(secret|password|passwd|device|token|authorization|cookie|account_?id|exchange_?code|api_?key|^auth$)/i;

function sanitizeUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    const parsed = new URL(raw, 'http://localhost');
    if (parsed.username) parsed.username = '[REDACTED]';
    if (parsed.password) parsed.password = '[REDACTED]';
    for (const [key] of parsed.searchParams) {
      if (SENSITIVE_FIELD_RE.test(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return /^https?:\/\//i.test(raw) ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return raw.replace(
      /([?&](?:secret|password|passwd|device_?id|account_?id|token|access_?token|refresh_?token|auth|code|key)=)[^&]*/gi,
      '$1[REDACTED]',
    );
  }
}

function redactSensitiveObject(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (depth > 4) return '[Truncated]';
  if (Array.isArray(value)) return value.map((item) => redactSensitiveObject(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELD_RE.test(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      out[k] = redactSensitiveObject(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function isHttpError(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (obj.isAxiosError === true) return true;
  if ('config' in obj && obj.config && typeof obj.config === 'object') {
    const cfg = obj.config as Record<string, unknown>;
    if ('headers' in cfg || 'auth' in cfg || 'url' in cfg || 'method' in cfg || 'data' in cfg) {
      return true;
    }
  }
  return 'response' in obj && 'request' in obj;
}

/**
 * Strips Axios/HTTP credentials (Authorization/Cookie headers, config.auth, secret/token/device
 * request bodies, raw request/response sockets) while preserving method, sanitized url, status,
 * and response.data error codes.
 */
export function redactHttpError(err: unknown): unknown {
  if (!isHttpError(err)) return err;

  const baseErr = err instanceof Error
    ? err
    : Object.assign(new Error(typeof err.message === 'string' ? err.message : 'HTTP Error'), err);
  const serialized = pino.stdSerializers.err(baseErr) as Record<string, unknown>;

  // Drop raw Axios fields that stdSerializers.err copies as enumerable properties.
  delete serialized.config;
  delete serialized.request;
  delete serialized.response;
  delete serialized.toJSON;

  const config = (err.config && typeof err.config === 'object' ? err.config : undefined) as Record<string, unknown> | undefined;
  const response = (err.response && typeof err.response === 'object' ? err.response : undefined) as Record<string, unknown> | undefined;

  const method = typeof config?.method === 'string' ? config.method.toUpperCase() : undefined;
  const url = sanitizeUrl(config?.url);
  const status = typeof response?.status === 'number'
    ? response.status
    : (typeof err.status === 'number' ? err.status : undefined);
  const statusText = typeof response?.statusText === 'string' ? response.statusText : undefined;

  const out: Record<string, unknown> = {
    ...serialized,
    ...(method ? { method } : {}),
    ...(url ? { url } : {}),
    ...(status !== undefined ? { status } : {}),
  };

  if (response) {
    out.response = {
      ...(status !== undefined ? { status } : {}),
      ...(statusText ? { statusText } : {}),
      ...(response.data !== undefined ? { data: redactSensitiveObject(response.data) } : {}),
    };
  }

  if (isHttpError(err.cause)) {
    out.cause = redactHttpError(err.cause);
  }

  return out;
}

function serializeError(value: unknown): unknown {
  if (isHttpError(value)) return redactHttpError(value);
  if (value instanceof Error) return pino.stdSerializers.err(value);
  return value;
}

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
    log: (obj) => {
      for (const [key, val] of Object.entries(obj)) {
        if (key !== 'err' && key !== 'error' && isHttpError(val)) {
          obj[key] = redactHttpError(val);
        }
      }
      return obj;
    },
  },
  
  // Deshabilitar características que consumen memoria
  base: undefined, // No incluir pid, hostname por defecto

  redact: {
    paths: [
      '*.config.headers.Authorization',
      '*.config.headers.authorization',
      '*.config.headers.Cookie',
      '*.config.headers.cookie',
      '*.config.auth',
      '*.response.config',
      '*.request',
      '*.response.request',
      'config.headers.Authorization',
      'config.headers.authorization',
      'config.headers.Cookie',
      'config.headers.cookie',
      'config.auth',
    ],
    censor: '[REDACTED]',
  },
  
  // Usar serializers solo cuando sea necesario
  serializers: {
    err: serializeError,
    error: serializeError,
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
