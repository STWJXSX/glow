import { Schema, model } from 'mongoose';

/**
 * Last successful delivery of a daily feed to one target, so a restart can tell whether
 * today's post already went out (and send it if not) without double-posting.
 *
 * target: `channel:<channelId>` for server feeds, `dm:<discordUserId>` for DM feeds.
 * day: the feed's own day key (for the shop: the WebPlatform shopDay).
 */
export interface IFeedDelivery {
  feedType: string;
  target: string;
  day: string;
  sentAt: Date;
}

const feedDeliverySchema = new Schema<IFeedDelivery>({
  feedType: { type: String, required: true },
  target: { type: String, required: true },
  day: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
});

feedDeliverySchema.index({ feedType: 1, target: 1 }, { unique: true });

export default model<IFeedDelivery>('FeedDelivery', feedDeliverySchema);
