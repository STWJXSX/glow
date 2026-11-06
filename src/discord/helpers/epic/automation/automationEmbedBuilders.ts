/**
 * Shared embed builders for Epic automation DMs.
 * Used by event modules and the dev preview script (must stay in sync).
 */

import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { translate, type SupportedLanguage } from '#helpers/locales/index.ts';
import type { AutoSecurityAlertPayload } from './autoSecurity/types.ts';

const DEFAULT_AVATAR =
  'https://fortnite-api.com/images/cosmetics/br/cid_890_athena_commando_f_choneheadhunter/variants/material/mat2.png';

const SAMPLE_THUMB =
  'https://fortnite-api.com/images/cosmetics/br/cid_030_athena_commando_m_halloween/icon.png';

export interface PreviewShopItem {
  itemName: string;
  itemType: string;
  itemRarity: string;
  finalPrice: number;
  itemImage?: string | null;
}

export interface PreviewDeviceAuth {
  userAgent: string;
  ipAddress: string;
  location: string;
  dateTime: string;
  deviceId: string;
}

export function buildAutoSecurityNewDeviceEmbed(
  displayName: string,
  device: PreviewDeviceAuth,
  lang: SupportedLanguage,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle(translate('autosecurity.dm.newDevice.title', lang))
    .setDescription(translate('autosecurity.dm.newDevice.description', lang, { displayName }))
    .addFields(
      {
        name: translate('autosecurity.dm.newDevice.fields.device', lang),
        value: `\`\`\`${device.userAgent}\`\`\``,
        inline: false,
      },
      {
        name: translate('autosecurity.dm.newDevice.fields.ip', lang),
        value: `**${device.ipAddress}**`,
        inline: true,
      },
      {
        name: translate('autosecurity.dm.newDevice.fields.location', lang),
        value: `**${device.location}**`,
        inline: true,
      },
      {
        name: translate('autosecurity.dm.newDevice.fields.date', lang),
        value: device.dateTime
          ? `<t:${Math.floor(new Date(device.dateTime).getTime() / 1000)}:F>`
          : translate('autosecurity.dm.newDevice.fields.unknown', lang),
        inline: false,
      },
      {
        name: translate('autosecurity.dm.newDevice.fields.deviceId', lang),
        value: `\`${device.deviceId}\``,
        inline: false,
      },
    )
    .setFooter({ text: translate('autosecurity.dm.newDevice.footer', lang) })
    .setTimestamp();
}

function alertTitleKey(kind: AutoSecurityAlertPayload['kind']): string {
  const map: Record<AutoSecurityAlertPayload['kind'], string> = {
    new_device: 'autosecurity.dm.newDevice.title',
    removed_device: 'autosecurity.dm.alerts.removedDevice.title',
    external_auth_added: 'autosecurity.dm.alerts.externalAdded.title',
    external_auth_removed: 'autosecurity.dm.alerts.externalRemoved.title',
    tfa_changed: 'autosecurity.dm.alerts.tfa.title',
    email_verified_changed: 'autosecurity.dm.alerts.email.title',
    display_name_changed: 'autosecurity.dm.alerts.displayName.title',
    last_login_changed: 'autosecurity.dm.alerts.lastLogin.title',
    account_country_changed: 'autosecurity.dm.alerts.country.title',
    known_device_new_location: 'autosecurity.dm.alerts.geo.title',
  };
  return map[kind];
}

function alertDescKey(kind: AutoSecurityAlertPayload['kind']): string {
  const map: Record<AutoSecurityAlertPayload['kind'], string> = {
    new_device: 'autosecurity.dm.newDevice.description',
    removed_device: 'autosecurity.dm.alerts.removedDevice.description',
    external_auth_added: 'autosecurity.dm.alerts.externalAdded.description',
    external_auth_removed: 'autosecurity.dm.alerts.externalRemoved.description',
    tfa_changed: 'autosecurity.dm.alerts.tfa.description',
    email_verified_changed: 'autosecurity.dm.alerts.email.description',
    display_name_changed: 'autosecurity.dm.alerts.displayName.description',
    last_login_changed: 'autosecurity.dm.alerts.lastLogin.description',
    account_country_changed: 'autosecurity.dm.alerts.country.description',
    known_device_new_location: 'autosecurity.dm.alerts.geo.description',
  };
  return map[kind];
}

export function buildAutoSecurityAlertEmbed(
  alert: AutoSecurityAlertPayload,
  lang: SupportedLanguage,
): EmbedBuilder {
  const { displayName, kind, device, detail, previous, current } = alert;
  const embed = new EmbedBuilder()
    .setColor(kind === 'tfa_changed' && current === 'off' ? 0xff0000 : 0xff4444)
    .setTitle(translate(alertTitleKey(kind), lang))
    .setDescription(
      translate(alertDescKey(kind), lang, {
        displayName,
        detail: detail ?? '',
        previous: previous ?? '',
        current: current ?? '',
      }),
    )
    .setFooter({ text: translate('autosecurity.dm.newDevice.footer', lang) })
    .setTimestamp();

  if (device) {
    embed.addFields(
      {
        name: translate('autosecurity.dm.newDevice.fields.device', lang),
        value: `\`\`\`${device.userAgent}\`\`\``,
        inline: false,
      },
      {
        name: translate('autosecurity.dm.newDevice.fields.ip', lang),
        value: `**${device.ipAddress}**`,
        inline: true,
      },
      {
        name: translate('autosecurity.dm.newDevice.fields.location', lang),
        value: `**${device.location}**`,
        inline: true,
      },
      {
        name: translate('autosecurity.dm.newDevice.fields.deviceId', lang),
        value: `\`${device.deviceId}\``,
        inline: false,
      },
    );
  }

  return embed;
}

export function buildAutoSecurityDeactivatedEmbed(
  displayName: string,
  lang: SupportedLanguage,
): EmbedBuilder {
  return buildAutomationAuthExpiredEmbed(displayName, lang, 'autosecurity');
}

export function buildAutomationAuthExpiredEmbed(
  displayName: string,
  lang: SupportedLanguage,
  detectedSystemKey?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle(translate('automation.tokenFailure.title', lang))
    .setDescription(translate('automation.tokenFailure.description', lang, { displayName }))
    .setFooter({ text: translate('automation.tokenFailure.footer', lang) })
    .setTimestamp();

  if (detectedSystemKey) {
    embed.addFields({
      name: translate('automation.tokenFailure.fieldSystem', lang),
      value: `\`${detectedSystemKey}\``,
      inline: true,
    });
  }

  return embed;
}

export interface RemovedAccountSnapshot {
  displayName: string;
  accountId: string;
  wasMain: boolean;
  /** Automation entries the account had; `settings` is the stored config (no tokens). */
  systems: { system: string; isActive: boolean; settings: Record<string, unknown> }[];
}

/** DM sent when Epic definitively rejected the account's login and it was removed from the bot. */
export function buildAccountRemovedMessage(
  snapshot: RemovedAccountSnapshot,
  lang: SupportedLanguage,
  detectedSystemKey?: string,
): { embeds: EmbedBuilder[]; files: AttachmentBuilder[] } {
  const t = (key: string, vars?: Record<string, string>) => translate(`automation.accountRemoved.${key}`, lang, vars);

  const systemLines = snapshot.systems.map((s) =>
    `• ${t('systemLine', { system: s.system, state: s.isActive ? t('stateActive') : t('stateInactive') })}`);

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(t('title'))
    .setDescription(t('description', { displayName: snapshot.displayName, accountId: snapshot.accountId }))
    .addFields(
      { name: t('fieldMain'), value: snapshot.wasMain ? t('mainYes') : t('mainNo'), inline: false },
      { name: t('fieldSystems'), value: systemLines.join('\n').slice(0, 1024) || t('noSystems'), inline: false },
    )
    .setTimestamp();
  if (detectedSystemKey) embed.setFooter({ text: t('footer', { system: detectedSystemKey }) });

  const files: AttachmentBuilder[] = [];
  if (snapshot.systems.length) {
    embed.addFields({ name: t('fieldBackup'), value: t('backupNote'), inline: false });
    const backup = {
      account: { displayName: snapshot.displayName, accountId: snapshot.accountId, wasMain: snapshot.wasMain },
      removedAt: new Date().toISOString(),
      automations: Object.fromEntries(snapshot.systems.map((s) => [s.system, s.settings])),
    };
    files.push(new AttachmentBuilder(Buffer.from(JSON.stringify(backup, null, 2)), {
      name: `removed-account-${snapshot.accountId.slice(0, 8)}.json`,
    }));
  }

  return { embeds: [embed], files };
}

export function buildAutoSecurityActionResultEmbed(
  success: boolean,
  messageKey: string,
  lang: SupportedLanguage,
  vars?: Record<string, string>,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(success ? 0x57f287 : 0xed4245)
    .setTitle(translate(messageKey, lang, vars))
    .setFooter({ text: translate('autosecurity.dm.newDevice.footer', lang) })
    .setTimestamp();
}

export function buildAutoFreeLlamasEmbed(
  llamaNames: string[],
  author: { name: string; iconURL: string } | null,
  lang: SupportedLanguage,
): EmbedBuilder {
  const es = lang === 'es';
  const llamaList = llamaNames.map((n) => `• **${n}**`).join('\n');

  const embed = new EmbedBuilder()
    .setColor('#8A2BE2')
    .setTitle(es ? 'Llamas Gratis Reclamadas' : 'Free Llamas Claimed')
    .setDescription(
      (es
        ? `Se reclamaron **${llamaNames.length}** llama(s) gratis:\n\n`
        : `Claimed **${llamaNames.length}** free llama(s):\n\n`) + llamaList,
    )
    .setFooter({ text: 'Glow AutoFreeLlamas' })
    .setTimestamp();

  if (author) embed.setAuthor(author);
  return embed;
}

export function buildAutoPurgeFriendsEmbed(
  accountName: string,
  accountAvatar: string,
  removedNames: string[],
  removedCount: number,
  whitelistSize: number,
  keptCount: number,
  lang: SupportedLanguage,
): EmbedBuilder {
  const displayList = removedNames.slice(0, 15).map((n) => `- ${n}`).join('\n');
  const extraCount =
    removedNames.length > 15 ? `\n... and **${removedNames.length - 15}** more` : '';

  return new EmbedBuilder()
    .setColor('#FF6B35')
    .setAuthor({ name: accountName, iconURL: accountAvatar })
    .setTitle('AutoPurge Friends — Cleanup Complete')
    .setDescription(
      `Removed **${removedCount}** friend${removedCount !== 1 ? 's' : ''}:\n${displayList}${extraCount}\n\n` +
        `Whitelisted: **${whitelistSize}** | Kept: **${keptCount}**`,
    )
    .setFooter({ text: translate('autodaily.dm.success.footer', lang) })
    .setTimestamp();
}

export function buildAutoExpeditionTokenErrorEmbed(accountName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('Auto-Expediciones Desactivadas')
    .setDescription(
      `La cuenta **${accountName}** ha sido eliminada del sistema de auto-expediciones debido a problemas de autenticación.`,
    )
    .addFields(
      { name: 'Motivo', value: '>>> No se pudo renovar el token de acceso', inline: false },
      {
        name: 'Solución',
        value: '>>> Vuelve a configurar las auto-expediciones con `/autoexpediciones configurar`',
        inline: false,
      },
    )
    .setTimestamp();
}

export function buildAutoExpeditionAccountErrorEmbed(
  accountName: string,
  error: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('Error en Auto-Expediciones')
    .setDescription(`Error procesando la cuenta **${accountName}**`)
    .addFields({ name: 'Error', value: `>>> ${error}`, inline: false })
    .setTimestamp();
}

export function buildAutoExpeditionCollectEmbed(
  accountName: string,
  accountAvatar: string,
  expeditionName: string,
  isSuccessful: boolean,
  rewards: Array<{ name: string; qty: number }>,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(isSuccessful ? '#00ff00' : '#ff0000')
    .setAuthor({ name: accountName, iconURL: accountAvatar })
    .setTimestamp()
    .addFields(
      {
        name: expeditionName,
        value: `>>> Expedición ${isSuccessful ? 'exitosa' : 'fallida'}`,
        inline: false,
      },
      {
        name: 'Resultado',
        value: `>>> ${isSuccessful ? 'Exitosa' : 'Fallida'}`,
        inline: true,
      },
      {
        name: 'Héroes liberados',
        value: '>>> Héroes disponibles para nuevas misiones',
        inline: true,
      },
    );

  if (isSuccessful && rewards.length > 0) {
    embed.addFields({
      name: 'Recompensas obtenidas',
      value: `>>> ${rewards.map((r) => `${r.name} **×${r.qty}**`).join('\n')}`,
      inline: false,
    });
  } else if (!isSuccessful) {
    embed.addFields({
      name: 'Expedición fallida',
      value: '>>> La expedición falló y no se obtuvieron recompensas',
      inline: false,
    });
  }

  return embed;
}

export function buildAutoExpeditionSentEmbed(
  accountName: string,
  accountAvatar: string,
  expeditionNumber: number,
  expeditionName: string,
  power: number,
  timeRemaining: string,
  heroesText: string,
  heroCount: number,
  lang: SupportedLanguage,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor('Green')
    .setAuthor({ name: accountName, iconURL: accountAvatar })
    .setTitle(`${expeditionNumber}. ${expeditionName}`)
    .addFields(
      {
        name: translate('expedition_power', lang) || 'Poder',
        value: `>>> **${power}**`,
        inline: true,
      },
      {
        name: translate('expedition_time_remaining', lang) || 'Tiempo restante',
        value: `>>> **${timeRemaining}**`,
        inline: true,
      },
      {
        name: lang === 'es' ? `Héroes enviados (${heroCount})` : `Heroes sent (${heroCount})`,
        value: `>>> ${heroesText}`,
        inline: false,
      },
    )
    .setTimestamp();
}

export function buildAutoExpeditionSummaryEmbed(
  accountName: string,
  accountAvatar: string,
  sentCount: number,
  expeditionTypes: string,
  lang: SupportedLanguage,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor('#00D9FF')
    .setAuthor({ name: accountName, iconURL: accountAvatar })
    .setTitle(lang === 'es' ? 'Resumen de Auto-Expediciones' : 'Auto-Expeditions Summary')
    .addFields(
      {
        name: lang === 'es' ? 'Expediciones enviadas' : 'Expeditions sent',
        value: `>>> **${sentCount}**`,
        inline: true,
      },
      {
        name: lang === 'es' ? 'Tipo solicitado' : 'Requested type',
        value: `>>> **${expeditionTypes}**`,
        inline: true,
      },
    )
    .setTimestamp();
}

export const PREVIEW_SAMPLE = {
  displayName: 'GlowPreview',
  accountName: 'Preview Commander',
  accountAvatar: DEFAULT_AVATAR,
  shopItem: {
    itemName: 'Skull Trooper',
    itemType: 'Outfit',
    itemRarity: 'Epic',
    finalPrice: 1500,
    itemImage: SAMPLE_THUMB,
  } satisfies PreviewShopItem,
  freeItem: {
    itemName: 'Daily Free Reward',
    itemType: 'Emote',
    itemRarity: 'Rare',
    finalPrice: 0,
    itemImage: SAMPLE_THUMB,
  } satisfies PreviewShopItem,
};
