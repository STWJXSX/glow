import mongoose from 'mongoose';
import { Client } from 'discord.js';
import logger from '#helpers/core/logger.ts';
import { getMongoTlsOptions } from '#helpers/core/tlsSetup.ts';
import type { BotEvent } from '#structures/types.ts';

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 segundos
const EXTENDED_RETRY_DELAY = 15 * 60 * 1000; // 15 minutos
const CONNECT_TIMEOUT_MS = 15000;

let retryCount = 0;
let isConnecting = false;
let reconnectTimeout: NodeJS.Timeout | null = null;
let mongoReadyPromise: Promise<void> | null = null;

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/** Espera a que MongoDB esté conectado antes de consultas en handlers ready. */
export function waitForMongoConnected(client: Client, timeoutMs = 60000): Promise<void> {
  if (isMongoConnected()) {
    return Promise.resolve();
  }

  if (!mongoReadyPromise) {
    mongoReadyPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`MongoDB no conectó en ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      const resolveReady = () => {
        clearTimeout(timer);
        resolve();
      };

      client.once('mongoConnected' as any, resolveReady);
      mongoose.connection.once('connected', resolveReady);
    });
  }

  return mongoReadyPromise;
}

type DnsJsonAnswer = {
  type: number;
  data: string;
};

type DnsJsonResponse = {
  Status?: number;
  Answer?: DnsJsonAnswer[];
};

async function queryDnsOverHttps(name: string, type: 'SRV' | 'TXT'): Promise<DnsJsonAnswer[]> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const response = await fetch(url, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`DoH ${type} HTTP ${response.status}`);
  }

  const data = await response.json() as DnsJsonResponse;
  if (data.Status !== 0) {
    throw new Error(`DoH ${type} status ${data.Status ?? 'unknown'}`);
  }

  const expectedType = type === 'SRV' ? 33 : 16;
  return (data.Answer ?? []).filter(answer => answer.type === expectedType);
}

function parseTxtRecord(data: string): string {
  const quoted = data.match(/"([^"]*)"/g);
  if (quoted) {
    return quoted.map(part => part.slice(1, -1)).join('');
  }

  return data.replace(/"/g, '');
}

async function resolveMongoSrvFallback(uri: string): Promise<string> {
  if (!uri.startsWith('mongodb+srv://')) {
    return uri;
  }

  const parsed = new URL(uri);
  const srvName = `_mongodb._tcp.${parsed.hostname}`;

  try {
    const [srvAnswers, txtAnswers] = await Promise.all([
      queryDnsOverHttps(srvName, 'SRV'),
      queryDnsOverHttps(parsed.hostname, 'TXT').catch(() => [] as DnsJsonAnswer[]),
    ]);

    const hosts = srvAnswers
      .map(answer => {
        const parts = answer.data.trim().split(/\s+/);
        const port = Number(parts[2]);
        const host = parts[3]?.replace(/\.$/, '');
        return host && Number.isFinite(port) ? `${host}:${port}` : null;
      })
      .filter((host): host is string => Boolean(host));

    if (hosts.length === 0) {
      return uri;
    }

    const params = new URLSearchParams(parsed.searchParams);
    for (const answer of txtAnswers) {
      const txtParams = new URLSearchParams(parseTxtRecord(answer.data));
      txtParams.forEach((value, key) => {
        if (!params.has(key)) params.set(key, value);
      });
    }
    params.set('tls', 'true');

    const auth = parsed.username
      ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@`
      : '';
    const query = params.toString();
    const resolvedUri = `mongodb://${auth}${hosts.join(',')}${parsed.pathname}${query ? `?${query}` : ''}`;

    logger.info(`[MONGODB] DNS SRV resuelto via DoH (${parsed.hostname} -> ${hosts.length} hosts)`);
    return resolvedUri;
  } catch (error) {
    const err = error as Error;
    logger.warn(`[MONGODB] No se pudo resolver SRV por DoH (${parsed.hostname}): ${err.message}`);
    return uri;
  }
}

/**
 * Conectar a MongoDB con sistema de reintentos optimizado
 */
async function connectWithRetry(client: Client, mongoURI: string): Promise<void> {
  if (isConnecting) {
    return;
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  isConnecting = true;

  try {
    const resolvedMongoURI = await resolveMongoSrvFallback(mongoURI);

    await mongoose.connect(resolvedMongoURI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      socketTimeoutMS: 45000,
      family: 4, // Forzar IPv4 para evitar problemas de DNS
      ...getMongoTlsOptions(),
    });

    logger.info('[MONGODB] Conectado exitosamente');

    void mongoose.connection.dropCollection('autoxpboosts').catch(() => undefined);
    void mongoose.connection.dropCollection('taxipermitteds').catch(() => undefined);

    // Limpiar contador de reintentos
    retryCount = 0;
    isConnecting = false;
    mongoReadyPromise = null;

    // Emitir evento personalizado para que ready.ts sepa que MongoDB está listo
    client.emit('mongoConnected' as any);

    // Asignar conexión al cliente para acceso global
    (client as any).mongo = mongoose.connection;

  } catch (error) {
    isConnecting = false;
    mongoReadyPromise = null;
    retryCount++;

    const err = error as Error;
    logger.error(`[MONGODB] Error de conexión (intento ${retryCount}/${MAX_RETRIES}): ${err.message}`);

    if (retryCount < MAX_RETRIES) {
      // Reintento normal cada 5 segundos
      logger.warn(`[MONGODB] Reintentando en ${RETRY_DELAY / 1000} segundos...`);
      reconnectTimeout = setTimeout(() => {
        connectWithRetry(client, mongoURI);
      }, RETRY_DELAY);
    } else {
      // Después de 5 intentos, esperar 15 minutos
      logger.error(`[MONGODB] Máximo de reintentos alcanzado. Reintentando en 15 minutos...`);
      retryCount = 0; // Resetear contador para el próximo ciclo
      reconnectTimeout = setTimeout(() => {
        connectWithRetry(client, mongoURI);
      }, EXTENDED_RETRY_DELAY);
    }
  }
}

/**
 * Configurar listeners para reconexión automática
 */
function setupReconnectionListeners(client: Client, mongoURI: string): void {
  mongoose.connection.on('disconnected', () => {
    logger.warn('[MONGODB] Desconectado. Intentando reconectar...');

    if (isConnecting || reconnectTimeout) {
      return;
    }

    retryCount = 0;
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connectWithRetry(client, mongoURI);
    }, RETRY_DELAY);
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`[MONGODB] Error en conexión: ${err.message}`);
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('[MONGODB] Reconectado exitosamente');
    retryCount = 0;
  });
}

// Función standalone para inicializar MongoDB
export async function initMongoDB(client: Client): Promise<void> {
  // Seleccionar URI según el entorno
  const isDevelopment = process.env.NODE_ENV === 'development';
  const mongoURI = isDevelopment ? process.env.MONGO_URI_DEV : process.env.MONGO_URI;

  if (!mongoURI) {
    const envVar = isDevelopment ? 'MONGO_URI_DEV' : 'MONGO_URI';
    logger.error(`[MONGODB] ${envVar} no está definido en las variables de entorno`);
    return;
  }

  // Log del entorno actual
  if (isDevelopment) {
    logger.info('[MONGODB] 🔧 Conectando a base de datos de DESARROLLO');
  } else {
    logger.info('[MONGODB] 🚀 Conectando a base de datos de PRODUCCIÓN');
  }

  // Configurar listeners de reconexión
  setupReconnectionListeners(client, mongoURI);

  // Conectar en segundo plano — no bloquear client.login()
  // ready.ts y otros subsistemas esperan el evento mongoConnected
  void connectWithRetry(client, mongoURI);

  // Manejo de cierre graceful
  process.on('SIGINT', async () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    
    await mongoose.connection.close();
    logger.info('[MONGODB] Conexión cerrada por terminación de aplicación');
  });
}

// No exportar como evento, solo la función de inicialización
const event = null;
export default event;
