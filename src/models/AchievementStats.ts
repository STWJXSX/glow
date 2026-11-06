import { Schema, model, Document } from 'mongoose';

/**
 * Estadísticas de uso por usuario (Discord ID) para el sistema de logros.
 * Alimentado por interactionCreate (comandos) y eventos puntuales (counters).
 * Consumido por la API interna del bot (/internal/achievements/stats/:discordId),
 * que a su vez consume la WebPlatform vía HTTP.
 */
export interface IAchievementStats extends Document {
  discordId: string;
  /** Total de comandos ejecutados con éxito */
  totalCommands: number;
  /** Contador por nombre de comando (ej: dupe, daily, llamas...) */
  commands: Map<string, number>;
  /** Contadores genéricos de eventos no-comando (ej: premiumRedeems) */
  counters: Map<string, number>;
  /** Días distintos (UTC) con al menos un comando */
  activeDays: number;
  /** Último día activo en formato YYYY-MM-DD (UTC) */
  lastActiveDay: string | null;
  firstCommandAt: Date | null;
  lastCommandAt: Date | null;
  updatedAt: Date;
}

const achievementStatsSchema = new Schema<IAchievementStats>({
  discordId: { type: String, required: true, unique: true },
  totalCommands: { type: Number, default: 0 },
  commands: { type: Map, of: Number, default: new Map() },
  counters: { type: Map, of: Number, default: new Map() },
  activeDays: { type: Number, default: 0 },
  lastActiveDay: { type: String, default: null },
  firstCommandAt: { type: Date, default: null },
  lastCommandAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export default model<IAchievementStats>('AchievementStats', achievementStatsSchema);
