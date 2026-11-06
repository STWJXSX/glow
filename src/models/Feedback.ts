import { Schema, model, Document } from 'mongoose';

export type FeedbackType = 'suggestion' | 'bugreport';
export type FeedbackStatus = 'pending' | 'accepted' | 'investigating' | 'found' | 'resolved' | 'rejected';

export interface IFeedback extends Document {
  /** Discord message ID in the feedback channel */
  messageId: string;
  /** Channel where the feedback was posted */
  channelId: string;
  /** User who submitted */
  userId: string;
  /** Type of feedback */
  type: FeedbackType;
  /** Original title */
  title: string;
  /** Original description */
  description: string;
  /** Optional image URL */
  imageUrl: string | null;
  /** Original language */
  originalLang: string;
  /** Title translated to English (if original was not English) */
  titleEn: string;
  /** Description translated to English (if original was not English) */
  descriptionEn: string;
  /** Current status */
  status: FeedbackStatus;
  /** Trello card id (if Trello is configured) */
  trelloCardId: string | null;
  /** Trello card URL (for the DM link) */
  trelloCardUrl: string | null;
  /** Timestamp */
  createdAt: Date;
}

const feedbackSchema = new Schema<IFeedback>({
  messageId:     { type: String, required: true, unique: true },
  channelId:     { type: String, required: true },
  userId:        { type: String, required: true },
  type:          { type: String, enum: ['suggestion', 'bugreport'], required: true },
  title:         { type: String, required: true },
  description:   { type: String, required: true },
  imageUrl:      { type: String, default: null },
  originalLang:  { type: String, default: 'en' },
  titleEn:       { type: String, default: '' },
  descriptionEn: { type: String, default: '' },
  status:        { type: String, enum: ['pending', 'accepted', 'investigating', 'found', 'resolved', 'rejected'], default: 'pending' },
  trelloCardId:  { type: String, default: null },
  trelloCardUrl: { type: String, default: null },
  createdAt:     { type: Date, default: Date.now },
});

export default model<IFeedback>('Feedback', feedbackSchema);
