import { Schema, model, Document } from 'mongoose';
import { randomUUID } from 'crypto';

export interface ICommunityLoadoutGadget {
  templateId: string;
  slotIndex: number;
}

export interface ICommunityLoadout extends Document {
  /** Public UUID shown in community embeds */
  publicId: string;
  /** Display name chosen by the author */
  name: string;
  /** Commander English name (stored for search/display fallback) */
  commanderEnName: string;
  /** Discord ID of whoever saved this loadout */
  authorDiscordId: string;
  /** Epic account that owned this loadout at upload time */
  authorAccountId: string;
  authorDisplayName: string;
  /** Source CampaignHeroLoadout item GUID */
  sourceLoadoutGuid: string;
  /** CommanderSlot templateId — Hero:hid_... */
  commanderTemplateId: string;
  commanderLevel: number;
  /** FollowerSlot1-5 templateIds (may be empty strings for empty slots) */
  teamHeroTemplateIds: string[];
  teamHeroLevels: number[];
  teamHeroDisplayNames: string[];
  /** TeamPerk templateId — TeamPerk:tpid_... (empty string = none) */
  teamPerkTemplateId: string;
  teamPerkDisplayName: string;
  /** [{templateId: "Gadget:g_...", slotIndex: 0|1}] */
  gadgets: ICommunityLoadoutGadget[];
  gadgetDisplayNames: string[];
  /** originating loadout snapshot metadata (1-based) */
  loadoutIndex: number;
  /** Clone count (legacy field name: saves) */
  saves: number;
  likes: string[];
  dislikes: string[];
  /** Discord message in community channel */
  messageId?: string;
  channelId?: string;
  guildId?: string;
  createdAt: Date;
}

const CommunityLoadoutSchema = new Schema<ICommunityLoadout>(
  {
    publicId: { type: String, unique: true, index: true, sparse: true },
    name: { type: String, required: true, maxlength: 80, trim: true },
    commanderEnName: { type: String, required: true, default: '' },
    authorDiscordId: { type: String, required: true, index: true },
    authorAccountId: { type: String, default: '', index: true },
    authorDisplayName: { type: String, required: true, default: '' },
    sourceLoadoutGuid: { type: String, required: true, default: '' },
    commanderTemplateId: { type: String, required: true },
    commanderLevel: { type: Number, default: 1 },
    teamHeroTemplateIds: { type: [String], default: [] },
    teamHeroLevels: { type: [Number], default: [] },
    teamHeroDisplayNames: { type: [String], default: [] },
    teamPerkTemplateId: { type: String, default: '' },
    teamPerkDisplayName: { type: String, default: '' },
    gadgets: {
      type: [{
        templateId: { type: String },
        slotIndex: { type: Number },
      }],
      default: [],
    },
    gadgetDisplayNames: { type: [String], default: [] },
    loadoutIndex: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    likes: { type: [String], default: [] },
    dislikes: { type: [String], default: [] },
    messageId: { type: String, default: null },
    channelId: { type: String, default: null },
    guildId: { type: String, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } },
);

CommunityLoadoutSchema.pre('validate', function assignPublicId(next) {
  if (!this.publicId) this.publicId = randomUUID();
  next();
});

export default model<ICommunityLoadout>('CommunityLoadout', CommunityLoadoutSchema);
