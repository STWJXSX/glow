import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ButtonInteraction,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import {
  translate,
  getUserLanguage,
  buildDiscordLocalizations,
  type SupportedLanguage,
} from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import {
  AUTOMATION_DM_SYSTEMS,
  getDisabledAutomationDmSystems,
  type AutomationDmSystemKey,
} from '#helpers/epic/automation/automationNotify.ts';
import UserAutomationDM from '#models/UserAutomationDM.ts';

const DISCORD_BUTTON_LABEL_MAX = 80;

function buttonLabel(name: string): string {
  return name.length <= DISCORD_BUTTON_LABEL_MAX ? name : `${name.slice(0, DISCORD_BUTTON_LABEL_MAX - 1)}…`;
}

function systemName(key: AutomationDmSystemKey, lang: SupportedLanguage): string {
  return translate(`autoconfig.systems.${key}.name`, lang);
}

function isAutomationDmSystemKey(value: string): value is AutomationDmSystemKey {
  return (AUTOMATION_DM_SYSTEMS as readonly string[]).includes(value);
}

type DmPanelPayload = {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
};

async function buildPanel(
  interaction: ChatInputCommandInteraction,
  disabledSystems: Set<AutomationDmSystemKey>,
  disabled = false,
): Promise<DmPanelPayload> {
  const lang = (await getUserLanguage(interaction.user.id, interaction.locale)) as SupportedLanguage;
  const emojiActive = getEmoji(interaction.client, 'active');
  const emojiInactive = getEmoji(interaction.client, 'inactive');

  const lines: string[] = [];
  const systemButtons: ButtonBuilder[] = [];
  let enabledCount = 0;

  for (const key of AUTOMATION_DM_SYSTEMS) {
    const isEnabled = !disabledSystems.has(key);
    if (isEnabled) enabledCount++;

    const name = systemName(key, lang);
    const statusEmoji = isEnabled ? emojiActive : emojiInactive;
    lines.push(`${statusEmoji} **${name}**`);

    systemButtons.push(
      new ButtonBuilder()
        .setCustomId(`dm_toggle_${key}`)
        .setLabel(buttonLabel(name))
        .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
        .setDisabled(disabled),
    );
  }

  const total = AUTOMATION_DM_SYSTEMS.length;
  const subtitle = translate('dm.panel.description', lang);
  const description = `${subtitle}\n\n${lines.join('\n')}`;

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setAuthor({
      name: interaction.user.displayName,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTitle(translate('dm.panel.title', lang))
    .setDescription(description)
    .setFooter({
      text: translate('dm.panel.footer', lang, { enabled: enabledCount, total }),
    });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < systemButtons.length; i += 5) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(...systemButtons.slice(i, i + 5)),
    );
  }

  const allEnabled = enabledCount === total;
  const allDisabled = enabledCount === 0;

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('dm_enable_all')
        .setLabel(buttonLabel(translate('dm.panel.enableAll', lang)))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || allEnabled),
      new ButtonBuilder()
        .setCustomId('dm_disable_all')
        .setLabel(buttonLabel(translate('dm.panel.disableAll', lang)))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || allDisabled),
    ),
  );

  return { embed, components };
}

async function saveDisabledSystems(
  discordId: string,
  disabledSystems: Set<AutomationDmSystemKey>,
): Promise<void> {
  await UserAutomationDM.findOneAndUpdate(
    { discordId },
    { disabledSystems: Array.from(disabledSystems), updatedAt: new Date() },
    { upsert: true, new: true },
  );
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Enable or disable DM notifications from automatic systems')
    .setNameLocalizations(buildDiscordLocalizations('dm.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('dm.cmd._1'))
    .setDMPermission(true),

  cooldown: 5,
  auth: false,
  nodefer: false,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const discordId = interaction.user.id;
      let disabledSystems = await getDisabledAutomationDmSystems(discordId);

      const panel = await buildPanel(interaction, disabledSystems);
      await interaction.editReply({
        content: null,
        embeds: [panel.embed],
        components: panel.components,
      });

      const message = await interaction.fetchReply();
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000, // 5 minutes
      });

      collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
        if (buttonInteraction.user.id !== discordId) {
          const btnLang = (await getUserLanguage(buttonInteraction.user.id, buttonInteraction.locale)) as SupportedLanguage;
          await buttonInteraction.reply({
            content: `${getEmoji(buttonInteraction.client, 'error')} ${translate('autoconfig.errors.onlyAuthor', btnLang)}`,
            ephemeral: true,
          });
          return;
        }

        await buttonInteraction.deferUpdate();

        try {
          if (buttonInteraction.customId === 'dm_enable_all') {
            disabledSystems = new Set();
            await saveDisabledSystems(discordId, disabledSystems);
          } else if (buttonInteraction.customId === 'dm_disable_all') {
            disabledSystems = new Set(AUTOMATION_DM_SYSTEMS);
            await saveDisabledSystems(discordId, disabledSystems);
          } else if (buttonInteraction.customId.startsWith('dm_toggle_')) {
            const key = buttonInteraction.customId.slice('dm_toggle_'.length);
            if (isAutomationDmSystemKey(key)) {
              if (disabledSystems.has(key)) {
                disabledSystems.delete(key);
              } else {
                disabledSystems.add(key);
              }
              await saveDisabledSystems(discordId, disabledSystems);
            }
          }

          const updated = await buildPanel(interaction, disabledSystems);
          await interaction.editReply({
            content: null,
            embeds: [updated.embed],
            components: updated.components,
          });
        } catch (err: any) {
          log.commands.error({ command: 'dm', discordId, error: err?.message }, '[DM] Error updating preferences');
        }
      });

      collector.on('end', async () => {
        try {
          const finalDisabled = await getDisabledAutomationDmSystems(discordId);
          const disabledPanel = await buildPanel(interaction, finalDisabled, true);
          await interaction.editReply({
            content: null,
            embeds: [disabledPanel.embed],
            components: disabledPanel.components,
          });
        } catch {
          // Message may have been deleted or interaction expired
        }
      });
    } catch (error: any) {
      log.commands.error({ command: 'dm', error: error?.message }, 'Error in /dm');
      await interaction.editReply({
        content: `${getEmoji(interaction.client, 'error')} ${error?.message || 'Unexpected error.'}`,
        embeds: [],
        components: [],
      }).catch(() => {});
    }
  },
};

export default command;
