import { Schema, model } from 'mongoose';

/**
 * Tipos de feeds disponibles para DM
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
 * Interfaz para un feed DM individual
 */
export interface FeedDM {
  type: FeedType;
  activatedAt: Date;
}

/**
 * Interfaz del documento FeedDMConfig
 */
export interface IFeedDMConfig {
  discordUserId: string;
  feeds: FeedDM[];
  createdAt?: Date;
  updatedAt?: Date;
}

const feedDMConfigSchema = new Schema<IFeedDMConfig>({
  discordUserId: { 
    type: String, 
    required: true,
    unique: true
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
    activatedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

export default model<IFeedDMConfig>('FeedDMConfig', feedDMConfigSchema);
