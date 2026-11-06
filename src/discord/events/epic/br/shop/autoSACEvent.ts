/**
 * AUTO SAC SYSTEM
 * Sistema automático de establecimiento de códigos de creador (Support-A-Creator)
 * Se ejecuta diariamente a las 01:00 UTC
 * 
 * Funcionalidades:
 * - Verifica el SAC actual de cada cuenta
 * - Establece el SAC configurado si no coincide
 * - Envía DM al usuario confirmando el establecimiento
 * - Maneja errores de token automáticamente
 */

import cron from 'node-cron';
import axios from 'axios';
import type { ExtendedClient, BotEvent } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import AutoSAC from '#models/AutoSAC.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { sendAutomationUserDm } from '#helpers/epic/automation/automationNotify.ts';
import { runMonitoredEpicEvent, type EpicEventRunResult } from '#helpers/epic/automation/epicEventMonitor.ts';
import { buildAutoSacNotificationEmbed } from '#helpers/epic/br/automation/autoSacEmbed.ts';
import { cleanNonPremiumEntries } from '#helpers/epic/utils/premiumCleanup.ts';
import { shouldProcessAutomationAccount } from '#helpers/epic/automation/accountSuspensionSchema.ts';
import { markAutomationTokenFailure, resolveAutomationDisplayName } from '#helpers/epic/automation/tokenFailurePolicy.ts';
import { recordAutomation, flushAutomation } from '#helpers/discord/channelLogs/botLogs.ts';

/**
 * Obtiene el SAC actual de una cuenta
 */
async function getCurrentSAC(accessToken: string, accountId: string): Promise<string | null> {
  try {
    const response = await composeMCP({
      profile: 'common_core',
      operation: 'QueryProfile',
      accountId,
      accessToken,
    });

    const stats = response.profileChanges?.[0]?.profile?.stats?.attributes;
    return stats?.mtx_affiliate || null;
  } catch (error: any) {
    log.epic.error(
      { accountId, error: error.message },
      '[AUTOSAC] Error obteniendo SAC actual'
    );
    return null;
  }
}

/**
 * Establece el SAC para una cuenta
 */
async function setSAC(accessToken: string, accountId: string, codigoSAC: string): Promise<boolean> {
  try {
    const response = await axios.post(
      `${Endpoints.FORTNITE_API}/game/v2/profile/${accountId}/client/SetAffiliateName`,
      {
        affiliateName: codigoSAC,
      },
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        params: {
          profileId: 'common_core',
          rvn: -1,
        },
      }
    );

    return response.data.profileChanges && response.data.profileChanges.length > 0;
  } catch (error: any) {
    log.epic.error(
      { accountId, error: error.message },
      '[AUTOSAC] Error estableciendo SAC'
    );
    return false;
  }
}

/**
 * Procesa todas las cuentas de AutoSAC
 */
async function processAutoSACs(client: ExtendedClient): Promise<EpicEventRunResult> {
  try {
    log.epic.info('[AUTOSAC] ============================================');
    log.epic.info('[AUTOSAC] Iniciando proceso de verificación y establecimiento de SACs...');

    const autoSACEntries = await AutoSAC.find({});
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    log.epic.info(`[AUTOSAC] Encontradas ${autoSACEntries.length} entradas de AutoSAC`);

    for (const entry of autoSACEntries) {
      try {
        const userInfo = await UsuarioInfo.findOne({ id: entry.discordId });
        if (!userInfo || !userInfo.deviceAuths || userInfo.deviceAuths.length === 0) {
          log.epic.warn({ discordId: entry.discordId }, '[AUTOSAC] Usuario sin cuentas, saltando...');
          continue;
        }

        // Procesar cada cuenta activa del usuario
        for (const [accountKey, accountData] of entry.accounts) {
          if (!shouldProcessAutomationAccount(userInfo, accountData.accountId, accountData)) continue;

          processedCount++;
          log.epic.info(
            { discordId: entry.discordId, accountId: accountData.accountId },
            '[AUTOSAC] Procesando cuenta'
          );

          try {
            // Refrescar token de la cuenta
            const { account, error } = await refreshAccountToken(userInfo, accountData.accountId);

            if (!account) {
              if (error === 'tokenFailure') {
                await markAutomationTokenFailure({
                  client,
                  discordId: entry.discordId,
                  userInfo,
                  accountId: accountData.accountId,
                  displayName: resolveAutomationDisplayName(userInfo, accountData.accountId),
                  sourceSystem: 'autosac',
                });
              }
              errorCount++;
              recordAutomation('autosac', { accountId: accountData.accountId, displayName: resolveAutomationDisplayName(userInfo, accountData.accountId) }, false, 'Token refresh failed');
              continue;
            }

            // Verificar SAC actual
            const currentSAC = await getCurrentSAC(account.accessToken, account.accountId);

            // Si ya tiene el SAC correcto, no hacer nada
            if (currentSAC === accountData.sacToSet) {
              log.epic.info(
                { accountId: account.accountId, sac: currentSAC },
                '[AUTOSAC] ✅ Cuenta ya tiene el SAC correcto'
              );
              skippedCount++;
              continue;
            }

            // Establecer el SAC correcto
            const setSACResult = await setSAC(
              account.accessToken,
              account.accountId,
              accountData.sacToSet
            );

            if (setSACResult) {
              successCount++;
              recordAutomation('autosac', account, true, 'SAC set');
              log.epic.info(
                {
                  accountId: account.accountId,
                  displayName: account.displayName,
                  sac: accountData.sacToSet,
                },
                '[AUTOSAC] ✅ SAC establecido'
              );

              // Enviar DM al usuario
              try {
                const user = await client.users.fetch(entry.discordId);
                if (user) {
                  const embed = await buildAutoSacNotificationEmbed(client, entry.discordId, {
                    kind: 'success',
                    account: {
                      displayName: account.displayName || account.accountId,
                      accountId: account.accountId,
                      accessToken: account.accessToken,
                    },
                    sacCode: accountData.sacToSet,
                  });

                  await sendAutomationUserDm(client, entry.discordId, { embeds: [embed] }, {
                    system: 'autoSAC',
                    kind: 'success',
                  });
                  log.epic.debug({ discordId: entry.discordId }, '[AUTOSAC] DM enviado al usuario');
                }
              } catch (dmError: any) {
                log.epic.warn(
                  { error: dmError.message },
                  '[AUTOSAC] No se pudo enviar DM al usuario'
                );
              }
            } else {
              errorCount++;
              recordAutomation('autosac', account, false, 'Could not set SAC');
              log.epic.error({ accountId: account.accountId }, '[AUTOSAC] ❌ Error estableciendo SAC');
            }
          } catch (sacError: any) {
            log.epic.error(
              { accountId: accountData.accountId, error: sacError.message },
              '[AUTOSAC] ❌ Error procesando SAC para cuenta'
            );
            errorCount++;
            recordAutomation('autosac', { accountId: accountData.accountId, displayName: resolveAutomationDisplayName(userInfo, accountData.accountId) }, false, sacError.message);
          }

          // Pausa pequeña entre cuentas para evitar rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (entryError: any) {
        log.epic.error(
          { discordId: entry.discordId, error: entryError.message },
          '[AUTOSAC] ❌ Error procesando usuario'
        );
        errorCount++;
      }
    }

    log.epic.info(
      {
        processed: processedCount,
        success: successCount,
        skipped: skippedCount,
        errors: errorCount,
      },
      '[AUTOSAC] Proceso completado'
    );
    log.epic.info('[AUTOSAC] ============================================');
    await flushAutomation('autosac');
    return {
      success: errorCount === 0,
      stats: {
        Procesadas: processedCount,
        Éxitos: successCount,
        Omitidas: skippedCount,
        Errores: errorCount,
      },
    };
  } catch (error: any) {
    log.epic.error({ error: error.message }, '[AUTOSAC] ❌ Error en proceso de AutoSAC');
    return { success: false, error: error.message };
  }
}

/**
 * Evento Ready - Inicializa el sistema AutoSAC
 */
const event: BotEvent<'ready'> = {
  name: 'ready',
  once: true,

  async execute(client: ExtendedClient) {
    log.epic.info('[AUTOSAC] Inicializando sistema AutoSAC...');

    // Ejecutar todos los días a las 01:00 UTC
    cron.schedule(
      '0 1 * * *',
      async () => {
        log.epic.info('[AUTOSAC] Ejecutando limpieza de premium y verificación automática de SACs...');
        await runMonitoredEpicEvent(client, {
          system: 'autoSAC',
          title: 'Auto SAC',
          category: 'Shop',
          schedule: '01:00 UTC',
        }, async () => {
          await cleanNonPremiumEntries(client, AutoSAC, 'AutoSAC', 'autosac');
          return processAutoSACs(client);
        });
      },
      {
        scheduled: true,
        timezone: 'UTC',
      }
    );

    log.epic.info('[AUTOSAC] Sistema iniciado - Se ejecutará diariamente a las 01:00 UTC');
  },
};

export default event;
