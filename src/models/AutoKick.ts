import { Schema, model, Document } from 'mongoose';

/**
 * Expulsar de la misión al completarla (mission kick vía KickBot):
 *  - always: siempre
 *  - noPartyMates: solo si no hay otro miembro de tu party en la misión
 *  - never: nunca
 */
export const AUTOKICK_KICK_MODES = ['always', 'noPartyMates', 'never'] as const;
export type AutoKickKickMode = typeof AUTOKICK_KICK_MODES[number];

/** Registros antiguos sin kickMode → never (el leave estaba desactivado en código). */
export function resolveKickMode(config: { kickMode?: AutoKickKickMode | null } | null | undefined): AutoKickKickMode {
  const mode = config?.kickMode;
  return mode && (AUTOKICK_KICK_MODES as readonly string[]).includes(mode) ? mode : 'never';
}

export interface IAccountKick {
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  displayName: string;
  // Características existentes
  transferMaterials: boolean;
  kickPartyMembers: boolean;
  // Nuevas características configurables
  collectRewards: boolean;
  embedRewards: boolean;
  /** Legacy (sí/no); sustituido por kickMode. Se mantiene = kickMode !== 'never'. */
  autoLeave: boolean;
  kickMode?: AutoKickKickMode;
  autoReinvite: boolean;
}

export interface IAutoKick extends Document {
  discordId: string;
  accounts: Map<string, IAccountKick>;
  updatedAt: Date;
}

const autoKickSchema = new Schema<IAutoKick>({
  discordId: {
    type: String,
    required: true,
    unique: true,
  },
  accounts: {
    type: Map,
    of: {
      isActive: {
        type: Boolean,
        default: false,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      lastActivity: {
        type: Date,
        default: Date.now,
      },
      displayName: {
        type: String,
        default: '',
      },
      // Características existentes
      transferMaterials: {
        type: Boolean,
        default: false,
      },
      kickPartyMembers: {
        type: Boolean,
        default: false,
      },
      // Nuevas características configurables
      collectRewards: {
        type: Boolean,
        default: true, // Por defecto activado
      },
      embedRewards: {
        type: Boolean,
        default: true, // Por defecto activado
      },
      autoLeave: {
        type: Boolean,
        default: true, // Por defecto activado (salir automático)
      },
      kickMode: {
        type: String,
        enum: AUTOKICK_KICK_MODES,
        required: false,
      },
      autoReinvite: {
        type: Boolean,
        default: false, // Por defecto desactivado
      },
    },
    default: new Map(),
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware para actualizar updatedAt
autoKickSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoKick>('AutoKick', autoKickSchema);
