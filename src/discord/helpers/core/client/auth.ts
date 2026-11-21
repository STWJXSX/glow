import type { ChatInputCommandInteraction } from 'discord.js';
import { log } from '../logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';

/**
 * Sistema de autenticación para comandos
 * Verifica si el usuario ha aceptado los TOS
 */

/**
 * Verifica si un usuario ha aceptado los TOS
 * @param userId - ID del usuario de Discord
 * @returns {Promise<boolean>}
 */
export async function hasAcceptedTOS(userId: string): Promise<boolean> {
  try {
    const usuario = await UsuarioInfo.findOne({ id: userId });
    return usuario?.aceptarTOS === true;
  } catch (err) {
    log.bot.error({ err, userId }, 'Error verificando TOS');
    return false;
  }
}

/**
 * Verifica autenticación para un comando
 * @param interaction - La interacción del comando
 * @param requireAuth - Si el comando requiere autenticación
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function checkAuth(
  interaction: ChatInputCommandInteraction,
  requireAuth: boolean
): Promise<{ allowed: boolean; reason?: string }> {
  if (!requireAuth) {
    return { allowed: true };
  }
  
  const hasAccepted = await hasAcceptedTOS(interaction.user.id);
  
  if (!hasAccepted) {
    return {
      allowed: false,
      reason: 'auth_required',
    };
  }
  
  return { allowed: true };
}

export type MainAccountGate =
  | { status: 'ok' }
  | { status: 'no_accounts' }
  | { status: 'no_main' }
  | { status: 'auth_suspended' };

/** Main-account gate from an already loaded UsuarioInfo (no extra query). */
export function mainAccountGateFor(
  user: { deviceAuths?: { cuentaMain?: boolean; automationSuspended?: boolean }[] } | null,
): MainAccountGate {
  if (!user?.deviceAuths?.length) return { status: 'no_accounts' };
  const main = user.deviceAuths.find((acc) => acc.cuentaMain);
  if (!main) return { status: 'no_main' };
  if (main.automationSuspended) return { status: 'auth_suspended' };
  return { status: 'ok' };
}

/** At least one linked Epic account (bulk mode does not require main). */
export async function checkHasAccounts(userId: string): Promise<boolean> {
  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    return (user?.deviceAuths?.length ?? 0) > 0;
  } catch (err) {
    log.bot.error({ err, userId }, 'Error checking linked accounts');
    return false;
  }
}

/** Linked Epic accounts: requires at least one deviceAuth with cuentaMain for auth commands. */
export async function checkMainAccount(userId: string): Promise<MainAccountGate> {
  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user?.deviceAuths?.length) return { status: 'no_accounts' };
    const main = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!main) return { status: 'no_main' };
    if (main.automationSuspended) return { status: 'auth_suspended' };
    return { status: 'ok' };
  } catch (err) {
    log.bot.error({ err, userId }, 'Error checking main account');
    return { status: 'no_accounts' };
  }
}

/**
 * Acepta los TOS para un usuario
 * @param userId - ID del usuario
 * @returns {Promise<boolean>}
 */
export async function acceptTOS(userId: string): Promise<boolean> {
  try {
    await UsuarioInfo.findOneAndUpdate(
      { id: userId },
      { aceptarTOS: true },
      { upsert: true, new: true }
    );
    
    log.bot.info({ userId }, 'Usuario aceptó TOS');
    return true;
  } catch (err) {
    log.bot.error({ err, userId }, 'Error aceptando TOS');
    return false;
  }
}
