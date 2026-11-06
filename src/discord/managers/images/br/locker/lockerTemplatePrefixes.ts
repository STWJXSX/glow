import type { LockerCosmeticType } from './types.ts';

export interface LockerTemplatePrefixRule {
  prefix: string;
  type: LockerCosmeticType;
  backendValue: string;
  /** AthenaDance:* — real type from fortnite-api backendValue */
  needsEidResolve?: boolean;
}

/** Longer prefixes first (VehicleCosmetics_DriftTrail before Skin). */
export const LOCKER_TEMPLATE_PREFIXES: LockerTemplatePrefixRule[] = [
  { prefix: 'VehicleCosmetics_DriftTrail:', type: 'vehicle', backendValue: 'VehicleCosmetics_DriftTrail' },
  { prefix: 'VehicleCosmetics_Booster:', type: 'vehicle', backendValue: 'VehicleCosmetics_Booster' },
  { prefix: 'VehicleCosmetics_Skin:', type: 'vehicle', backendValue: 'VehicleCosmetics_Skin' },
  { prefix: 'VehicleCosmetics_Wheel:', type: 'vehicle', backendValue: 'VehicleCosmetics_Wheel' },
  { prefix: 'VehicleCosmetics_Body:', type: 'vehicle', backendValue: 'VehicleCosmetics_Body' },
  { prefix: 'CosmeticMimosaC:', type: 'companion', backendValue: 'CosmeticCompanion' },
  { prefix: 'CosmeticMimosa:', type: 'companion', backendValue: 'CosmeticCompanion' },
  { prefix: 'CosmeticShoes:', type: 'shoes', backendValue: 'CosmeticShoes' },
  { prefix: 'AthenaLoadingScreen:', type: 'loadingscreen', backendValue: 'AthenaLoadingScreen' },
  { prefix: 'AthenaSkyDiveContrail:', type: 'contrail', backendValue: 'AthenaSkyDiveContrail' },
  { prefix: 'AthenaCharacter:', type: 'outfit', backendValue: 'AthenaCharacter' },
  { prefix: 'AthenaBackpack:', type: 'backpack', backendValue: 'AthenaBackpack' },
  { prefix: 'AthenaPickaxe:', type: 'pickaxe', backendValue: 'AthenaPickaxe' },
  { prefix: 'AthenaGlider:', type: 'glider', backendValue: 'AthenaGlider' },
  { prefix: 'AthenaItemWrap:', type: 'wrap', backendValue: 'AthenaItemWrap' },
  { prefix: 'AthenaMusicPack:', type: 'music', backendValue: 'AthenaMusicPack' },
  { prefix: 'AthenaDance:', type: 'emote', backendValue: 'AthenaDance', needsEidResolve: true },
].sort((a, b) => b.prefix.length - a.prefix.length) as LockerTemplatePrefixRule[];
