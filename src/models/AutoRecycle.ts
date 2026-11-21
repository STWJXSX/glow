import { Schema, model, Document } from 'mongoose';

/** Rarity codes used by Fortnite templateIds */
export type RecycleRarity = 'c' | 'uc' | 'r' | 'vr' | 'sr';

/** All recyclable item categories */
export type RecycleCategory = 'schematics' | 'heroes' | 'survivors' | 'defenders';

export interface IRecycleCategoryConfig {
  enabled: boolean;
  /** Rarities to recycle (e.g. ['c','uc','r']) */
  rarities: RecycleRarity[];
  /** Only recycle duplicates (keep the highest-level copy) */
  duplicatesOnly: boolean;
}

export interface IAccountRecycle {
  isActive: boolean;
  accountId: string;
  schematics: IRecycleCategoryConfig;
  heroes: IRecycleCategoryConfig;
  survivors: IRecycleCategoryConfig;
  defenders: IRecycleCategoryConfig;
  createdAt: Date;
  lastActivity: Date;
  lastRecycledCount: number;
}

export interface IAutoRecycle extends Document {
  discordId: string;
  accounts: Map<string, IAccountRecycle>;
  updatedAt: Date;
}

const recycleCategorySchema = {
  enabled: { type: Boolean, default: false },
  rarities: { type: [String], default: [] },
  duplicatesOnly: { type: Boolean, default: false },
};

const autoRecycleSchema = new Schema<IAutoRecycle>({
  discordId: {
    type: String,
    required: true,
    unique: true,
  },
  accounts: {
    type: Map,
    of: {
      isActive: { type: Boolean, default: false },
      accountId: { type: String, required: true },
      schematics: recycleCategorySchema,
      heroes: recycleCategorySchema,
      survivors: recycleCategorySchema,
      defenders: recycleCategorySchema,
      createdAt: { type: Date, default: Date.now },
      lastActivity: { type: Date, default: Date.now },
      lastRecycledCount: { type: Number, default: 0 },
    },
    default: new Map(),
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

autoRecycleSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoRecycle>('AutoRecycle', autoRecycleSchema);
