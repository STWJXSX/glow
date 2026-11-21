import { Schema, model, Document } from 'mongoose';

export interface IDeviceAuth {
  displayName: string;
  accountId: string;
  deviceId: string;
  secret: string;
  cuentaMain: boolean;
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
  refreshExpiresAt: string | null;
  /** Set when Epic auth fails for automations (H2). Cleared on successful re-link / token refresh. */
  automationSuspended?: boolean;
  automationSuspendedAt?: string | null;
}

export interface IUsuarioInfo extends Document {
  id: string;
  aceptarTOS: boolean;
  deviceAuths: IDeviceAuth[];
  checkerImageConfig?: Record<string, boolean>;
}

const usuarioInfoSchema = new Schema<IUsuarioInfo>({
  id: { type: String, required: true, unique: true },
  aceptarTOS: { type: Boolean, default: false },
  checkerImageConfig: { type: Schema.Types.Mixed, default: undefined },
  deviceAuths: [
    {
      displayName: { type: String, default: 'IDK' },
      accountId: { type: String, required: true },
      deviceId: { type: String, required: true },
      secret: { type: String, required: true },
      cuentaMain: { type: Boolean, required: true },
      accessToken: { type: String, default: null },
      expiresAt: { type: String, default: null },
      refreshToken: { type: String, default: null },
      refreshExpiresAt: { type: String, default: null },
      automationSuspended: { type: Boolean, default: false },
      automationSuspendedAt: { type: String, default: null },
    },
  ],
});

export default model<IUsuarioInfo>('UsuarioInfo', usuarioInfoSchema);
