/**
 * MCP (Mission Control Protocol) HANDLER
 * Maneja las operaciones de perfil de Fortnite
 */

import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { log } from '#helpers/core/logger.ts';

export interface MCPOptions {
  profile: string;
  operation: string;
  accountId: string;
  accessToken: string;
  body?: any;
  route?: 'client' | 'public';
  /** When false, suppresses error logging (useful for bulk redeem probes). Default true. */
  logError?: boolean;
  /** Request timeout in ms. Default: none (axios waits forever). */
  timeout?: number;
}

export interface MCPResponse {
  success: boolean;
  data?: any;
  profileChanges?: Array<{
    profile?: any;
    changeType?: string;
  }>;
  error?: string;
  errorCode?: string;
  [key: string]: any;
}

/**
 * Ejecuta una operación MCP en la API de Epic Games
 */
export async function composeMCP(options: MCPOptions): Promise<MCPResponse> {
  const {
    profile,
    operation,
    accountId,
    accessToken,
    body = {},
    route = 'client',
    logError = true,
    timeout,
  } = options;

  const url = `${Endpoints.MCP}/${accountId}/${route}/${operation}?profileId=${profile}&rvn=-1`;
  
  try {
    const response = await axios.post(url, body, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      ...(timeout ? { timeout } : {}),
    });
    
    return {
      success: true,
      data: response.data,
      ...response.data, // Mantener compatibilidad con código que espera propiedades directas
    };
  } catch (error: any) {
    const errorData = error.response?.data;
    const errorMessage = errorData?.errorMessage || error.message;
    const errorCode = errorData?.errorCode || 'mcp_error';
    
    if (logError) {
      log.epic.error({
        error: errorData || error.message,
        operation,
        profile,
        accountId,
        route,
      }, 'Error en operación MCP');
    }
    
    throw {
      message: errorMessage,
      errorCode: errorCode,
      errorData: errorData,
      response: error.response
    };
  }
}
