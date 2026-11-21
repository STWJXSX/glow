/**
 * Epic Games OAuth Client Credentials
 * Different clients for different Epic Games services
 */

export interface EpicClient {
  clientId: string;
  clientSecret: string;
  authHeader: string;
}

/**
 * Android client - Primary for most operations
 */
export const ANDROID_CLIENT: EpicClient = {
  clientId: "3f69e56c7649492c8cc29f1af08a8a12",
  clientSecret: "b51ee9cb12234f50a69efa67ef53812e",
  authHeader: Buffer.from(
    "3f69e56c7649492c8cc29f1af08a8a12:b51ee9cb12234f50a69efa67ef53812e"
  ).toString("base64"),
};

/**
 * Launcher client - Required for Library Service and some Epic services
 */
export const LAUNCHER_CLIENT: EpicClient = {
  clientId: "34a02cf8f4414e29b15921876da36f9a",
  clientSecret: "daafbccc737745039dffe53d94fc76cf",
  authHeader: Buffer.from(
    "34a02cf8f4414e29b15921876da36f9a:daafbccc737745039dffe53d94fc76cf"
  ).toString("base64"),
};

/**
 * Fortnite client - For Fortnite-specific operations
 */
export const FORTNITE_CLIENT: EpicClient = {
  clientId: "98f7e42c2e3a4f86a74eb43fbb41ed39",
  clientSecret: "0a2449a2-001a-451e-afec-3e812901c4d7",
  authHeader: Buffer.from(
    "98f7e42c2e3a4f86a74eb43fbb41ed39:0a2449a2-001a-451e-afec-3e812901c4d7"
  ).toString("base64"),
};

/**
 * iOS client - Placeholder for future use
 * TODO: Fill in credentials when needed
 */
export const IOS_CLIENT: EpicClient = {
  clientId: "",
  clientSecret: "",
  authHeader: "",
};

/**
 * Switch client - Placeholder for future use
 * TODO: Fill in credentials when needed
 */
export const SWITCH_CLIENT: EpicClient = {
  clientId: "",
  clientSecret: "",
  authHeader: "",
};

/**
 * Client type enum for easy selection
 */
export const ClientType = {
  ANDROID: "ANDROID",
  LAUNCHER: "LAUNCHER",
  FORTNITE: "FORTNITE",
  IOS: "IOS",
  SWITCH: "SWITCH",
} as const;
export type ClientType = (typeof ClientType)[keyof typeof ClientType];

/**
 * Get client credentials by type
 */
export function getClient(type: ClientType): EpicClient {
  switch (type) {
    case ClientType.ANDROID:
      return ANDROID_CLIENT;
    case ClientType.LAUNCHER:
      return LAUNCHER_CLIENT;
    case ClientType.FORTNITE:
      return FORTNITE_CLIENT;
    case ClientType.IOS:
      return IOS_CLIENT;
    case ClientType.SWITCH:
      return SWITCH_CLIENT;
    default:
      return ANDROID_CLIENT;
  }
}
