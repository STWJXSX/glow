import { Schema, model } from 'mongoose';

/**
 * Tipos de feeds disponibles
 */
export type FeedType = 
  | 'tienda'
  | 'pavos'
  | 'supervivientes'
  | 'esquemas'
  | 'heroes'
  | 'defensores'
  | 'epicgames'
  | 'epicstatus'
  | 'worldinfo'
  | 'worldinfo_nomods'
  | 'competitive'
  | 'fnupdate'
  | 'eacupdate'
  | 'adminpanelcodes';

/**
 * Interfaz para un feed individual
 */
export interface Feed {
  type: FeedType;
  activatedBy: string;
  activatedAt: Date;
  roleId?: string;
}

/**
 * Interfaz del documento FeedConfig
 */
export interface IFeedConfig {
  guildId: string;
  channelId: string;
  feeds: Feed[];
  createdAt?: Date;
  updatedAt?: Date;
}

const feedConfigSchema = new Schema<IFeedConfig>({
  guildId: { 
    type: String, 
    required: true 
  },
  channelId: { 
    type: String, 
    required: true 
  },
  feeds: [{
    type: {
      type: String,
      required: true,
      enum: [
        'tienda',
        'pavos',
        'supervivientes',
        'esquemas',
        'heroes',
        'defensores',
        'epicgames',
        'epicstatus',
        'worldinfo',
        'worldinfo_nomods',
        'competitive',
        'fnupdate',
        'eacupdate',
        'adminpanelcodes',
      ]
    },
    activatedBy: {
      type: String,
      required: true
    },
    activatedAt: {
      type: Date,
      default: Date.now
    },
    roleId: {
      type: String,
      default: null
    }
  }]
}, {
  timestamps: true
});

// Índice compuesto para evitar duplicados de canal por servidor
feedConfigSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

export default model<IFeedConfig>('FeedConfig', feedConfigSchema);
