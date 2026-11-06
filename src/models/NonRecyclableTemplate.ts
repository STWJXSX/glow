import { Schema, model, Document } from 'mongoose';

/**
 * Item templates the game refused to recycle ("not a valid recyclable item").
 * Learned from any account's refusals and shared by all of them.
 * Only refusals of NON-favorite copies are stored: a favorite copy being refused
 * says nothing about the template.
 */
export interface INonRecyclableTemplate extends Document {
  /** Lowercased templateId, e.g. "defender:did_defenderassault_basic_c_t00" */
  templateId: string;
  /** Times the server refused a copy of this template */
  hits: number;
  firstSeen: Date;
  lastSeen: Date;
}

const nonRecyclableSchema = new Schema<INonRecyclableTemplate>({
  templateId: { type: String, required: true, unique: true },
  hits: { type: Number, default: 1 },
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
});

export default model<INonRecyclableTemplate>('NonRecyclableTemplate', nonRecyclableSchema);
