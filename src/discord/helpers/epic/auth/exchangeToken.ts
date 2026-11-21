import axios from "axios";
import { log } from "#helpers/core/logger.ts";
import { Endpoints } from "#helpers/core/endpoints.ts";
import {
  ANDROID_CLIENT,
  LAUNCHER_CLIENT,
  FORTNITE_CLIENT,
  ClientType,
  getClient,
  type EpicClient,
} from "./clientTokens.ts";

const logger = log.epic;

export interface DeviceAuth {
  accountId: string;
  deviceId: string;
  secret: string;
  displayName?: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  expires_at: string;
  token_type: string;
  refresh_token?: string;
  refresh_expires?: number;
  refresh_expires_at?: string;
  account_id: string;
  client_id: string;
  internal_client: boolean;
  client_service: string;
  displayName?: string;
  app: string;
  in_app_id: string;
  device_id?: string;
}

/**
 * Generate access token from deviceAuth credentials using specified client
 */
export async function getTokenFromDeviceAuth(
  deviceAuth: DeviceAuth,
  clientType: ClientType = ClientType.ANDROID
): Promise<TokenResponse | null> {
  try {
    const client = getClient(clientType);
    
    logger.debug(
      { accountId: deviceAuth.accountId, client: clientType },
      `Generating ${clientType} token from deviceAuth`
    );

    const params = new URLSearchParams({
      grant_type: "device_auth",
      account_id: deviceAuth.accountId,
      device_id: deviceAuth.deviceId,
      secret: deviceAuth.secret,
      token_type: "eg1",
    });

    const response = await axios.post<TokenResponse>(
      Endpoints.OAUTH_TOKEN_CREATE,
      params,
      {
        headers: {
          Authorization: `basic ${client.authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    logger.info(
      { displayName: response.data.displayName, client: clientType },
      `${clientType} token obtained successfully`
    );

    return response.data;
  } catch (error: any) {
    logger.error(
      { client: clientType, error: error.response?.data?.errorMessage || error.message },
      `Failed to get ${clientType} token from deviceAuth`
    );
    return null;
  }
}

/**
 * Exchange access token for another client type
 * Flow: accessToken -> exchangeCode -> new client accessToken
 */
export async function exchangeTokenForClient(
  accessToken: string,
  targetClientType: ClientType
): Promise<TokenResponse | null> {
  try {
    logger.debug({ targetClient: targetClientType }, "Exchanging token for new client");

    // Step 1: Get exchange code from current token
    const exchangeResponse = await axios.get<{ code: string; expiresInSeconds: number }>(
      Endpoints.OAUTH_EXCHANGE,
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
        },
      }
    );

    const exchangeCode = exchangeResponse.data.code;

    // Step 2: Use exchange code to get token for target client
    const targetClient = getClient(targetClientType);

    const params = new URLSearchParams({
      grant_type: "exchange_code",
      exchange_code: exchangeCode,
      token_type: "eg1",
    });

    const tokenResponse = await axios.post<TokenResponse>(
      Endpoints.OAUTH_TOKEN_CREATE,
      params,
      {
        headers: {
          Authorization: `basic ${targetClient.authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    logger.info(
      { client: targetClientType },
      `Token exchanged successfully to ${targetClientType}`
    );

    return tokenResponse.data;
  } catch (error: any) {
    logger.error(
      { targetClient: targetClientType, error: error.response?.data?.errorMessage || error.message },
      `Failed to exchange token for ${targetClientType}`
    );
    return null;
  }
}

/**
 * Generate Launcher token from deviceAuth
 * Tries multiple paths:
 * 1. Android deviceAuth -> Android token -> Exchange to Launcher
 * 2. Fortnite deviceAuth -> Fortnite token -> Exchange to Launcher
 * 
 * This is required for services like Library Service that only accept Launcher tokens
 */
export async function getLauncherTokenFromDeviceAuth(
  deviceAuth: DeviceAuth
): Promise<string | null> {
  try {
    logger.info(
      { accountId: deviceAuth.accountId },
      "Generating Launcher token from deviceAuth"
    );

    // Try Android path first
    const androidToken = await getTokenFromDeviceAuth(deviceAuth, ClientType.ANDROID);
    if (androidToken) {
      const launcherToken = await exchangeTokenForClient(
        androidToken.access_token,
        ClientType.LAUNCHER
      );
      if (launcherToken) {
        logger.info("Launcher token obtained via Android path");
        return launcherToken.access_token;
      }
    }

    // Fallback to Fortnite path
    logger.info("Android path failed, trying Fortnite path");
    const fortniteToken = await getTokenFromDeviceAuth(deviceAuth, ClientType.FORTNITE);
    if (fortniteToken) {
      const launcherToken = await exchangeTokenForClient(
        fortniteToken.access_token,
        ClientType.LAUNCHER
      );
      if (launcherToken) {
        logger.info("Launcher token obtained via Fortnite path");
        return launcherToken.access_token;
      }
    }

    logger.error("Failed to obtain Launcher token via any path");
    return null;
  } catch (error: any) {
    logger.error(
      { error: error.message },
      "Error generating Launcher token from deviceAuth"
    );
    return null;
  }
}

/**
 * Generic function to get token for any client type from deviceAuth
 * with automatic fallback and exchange
 */
export async function getTokenForClient(
  deviceAuth: DeviceAuth,
  targetClientType: ClientType
): Promise<string | null> {
  try {
    // Try direct generation first
    const directToken = await getTokenFromDeviceAuth(deviceAuth, targetClientType);
    if (directToken) {
      return directToken.access_token;
    }

    // Try Android -> Exchange path
    const androidToken = await getTokenFromDeviceAuth(deviceAuth, ClientType.ANDROID);
    if (androidToken) {
      const exchangedToken = await exchangeTokenForClient(
        androidToken.access_token,
        targetClientType
      );
      if (exchangedToken) {
        return exchangedToken.access_token;
      }
    }

    // Try Fortnite -> Exchange path
    const fortniteToken = await getTokenFromDeviceAuth(deviceAuth, ClientType.FORTNITE);
    if (fortniteToken) {
      const exchangedToken = await exchangeTokenForClient(
        fortniteToken.access_token,
        targetClientType
      );
      if (exchangedToken) {
        return exchangedToken.access_token;
      }
    }

    return null;
  } catch (error: any) {
    logger.error(
      { targetClient: targetClientType, error: error.message },
      "Error getting token for client"
    );
    return null;
  }
}
