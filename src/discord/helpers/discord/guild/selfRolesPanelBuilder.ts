import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type Client,
  type GuildMember,
} from 'discord.js';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import { SERVER_CONFIG, SELF_ROLE_SELECT_ID } from '#events/guild/config/serverConfig.ts';

export function buildSelfRolesEmbed(client: Client): EmbedBuilder {
  const avatar = client.user?.displayAvatarURL({ size: 256 }) ?? undefined;

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setAuthor({ name: 'Glow Self Roles', iconURL: avatar })
    .setThumbnail(avatar ?? null)
    .setDescription(
      '**Select your notification roles below.**\n' +
      'Pick every role you want, then confirm.\n\n' +
      '---\n' +
      '🇺🇸 **Fortnite feed pings** (V-Bucks, shop, etc.) are **not here**.\n' +
      'Go to the **feeds channel** and tap the button on the latest feed post.\n\n' +
      '🇪🇸 **Los pings de feeds** (pavos, tienda, etc.) **no están aquí**.\n' +
      'Ve al **canal de feeds** y pulsa el botón del último mensaje.',
    );
}

export function buildSelfRoleSelectRow(): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(SELF_ROLE_SELECT_ID)
    .setPlaceholder('Select your notification roles')
    .setMinValues(0)
    .setMaxValues(SERVER_CONFIG.PICK_ROLES.length)
    .addOptions(
      SERVER_CONFIG.PICK_ROLES.map((role) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(role.label)
          .setValue(role.id)
          .setDescription(role.description),
      ),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function findSelfRoleConfig(roleId: string) {
  return SERVER_CONFIG.PICK_ROLES.find((role) => role.id === roleId);
}

export async function syncMemberSelfRoles(
  member: GuildMember,
  selectedIds: string[],
): Promise<{ added: string[]; removed: string[] }> {
  const pool = new Set(SERVER_CONFIG.PICK_ROLES.map((role) => role.id));
  const selected = selectedIds.filter((id) => pool.has(id));

  const toAdd = selected.filter((id) => !member.roles.cache.has(id));
  const toRemove = [...pool].filter((id) => !selected.includes(id) && member.roles.cache.has(id));

  if (toAdd.length) await member.roles.add(toAdd).catch(() => {});
  if (toRemove.length) await member.roles.remove(toRemove).catch(() => {});

  return { added: toAdd, removed: toRemove };
}
