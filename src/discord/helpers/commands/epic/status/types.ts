export interface StatusData {
  mensaje: string;
  plataforma: string;
  presenceMode: string;
  lastUpdate: number;
}

export interface StatusConnectionData {
  accountName: string;
  sessionStarted: boolean;
  connectedAt: number;
}

/** Result of the core `status.info` action. */
export interface StatusInfoResult {
  isConnected: boolean;
  isActive: boolean;
  eosHealthy: boolean;
  statusData: StatusData | null;
  connectionData: StatusConnectionData | null;
}
