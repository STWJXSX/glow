import { Schema, model, Document } from 'mongoose';

/** Buyable STW item template IDs */
export type BuyableSTWItem =
  | 'AccountResource:reagent_evolverarity_r'
  | 'AccountResource:reagent_evolverarity_sr'
  | 'AccountResource:reagent_evolverarity_vr'
  | 'AccountResource:reagent_c_t01'
  | 'AccountResource:reagent_c_t02'
  | 'AccountResource:reagent_c_t03'
  | 'AccountResource:reagent_c_t04'
  | 'AccountResource:reagent_alteration_generic'
  | 'AccountResource:reagent_alteration_upgrade_uc'
  | 'AccountResource:reagent_alteration_upgrade_r'
  | 'AccountResource:reagent_alteration_upgrade_vr'
  | 'AccountResource:reagent_alteration_upgrade_sr'
  | 'Worker:workerbasic_vr_t01'
  | 'Token:accountinventorybonus'
  | 'Hero:legendary'
  | 'Schematic:legendary_weapon'
  | 'Defender:legendary'
  | 'Worker:legendary_survivor';

export interface IAccountBuySTW {
  isActive: boolean;
  accountId: string;
  /** Template IDs the user wants to auto-buy */
  selectedItems: string[];
  createdAt: Date;
  lastActivity: Date;
  lastPurchaseCount: number;
  lastGoldSpent: number;
}

export interface IAutoBuySTW extends Document {
  discordId: string;
  accounts: Map<string, IAccountBuySTW>;
  updatedAt: Date;
}

const autoBuySTWSchema = new Schema<IAutoBuySTW>({
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
      selectedItems: { type: [String], default: [] },
      createdAt: { type: Date, default: Date.now },
      lastActivity: { type: Date, default: Date.now },
      lastPurchaseCount: { type: Number, default: 0 },
      lastGoldSpent: { type: Number, default: 0 },
    },
    default: new Map(),
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

autoBuySTWSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoBuySTW>('AutoBuySTW', autoBuySTWSchema);
