import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ComponentType,
} from 'discord.js';
import type { Command, ExtendedClient } from '#structures/types.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { forEachUniqueCommand } from '#handlers/loadCommands.ts';
import {
  buildDiscordLocalizations,
  buildLocalizedChoices,
  getUserLanguage,
  resolveSlashLocalization,
  translate,
  translateForUser,
  type SupportedLanguage,
} from '#helpers/locales/index.ts';
import { EMBED_COLORS, type EmbedStyle } from '#helpers/core/embedHelper.ts';
import { isAutomationCommandGated } from '#helpers/epic/automation/config.ts';
import { isPremiumCheckBypassed } from '#helpers/core/client/premium.ts';

interface CommandInfo {
  name: string;
  description: string;
  isPremium: boolean;
  subcommands?: Array<{ name: string; description: string }>;
}

const MAX_EMBED_FIELD_NAME = 256;
const MAX_EMBED_FIELD_VALUE = 1024;
const EMPTY_FIELD = '\u200b';

function truncateEmbedText(text: string, max: number): string {
  if (!text?.trim()) return EMPTY_FIELD;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function buildCommandFieldValue(cmd: CommandInfo): string {
  let fieldValue = cmd.description?.trim() || EMPTY_FIELD;

  if (!cmd.subcommands?.length) {
    return truncateEmbedText(fieldValue, MAX_EMBED_FIELD_VALUE);
  }

  fieldValue += '\n';
  for (let subIndex = 0; subIndex < cmd.subcommands.length; subIndex++) {
    const sub = cmd.subcommands[subIndex];
    const isLast = subIndex === cmd.subcommands.length - 1;
    const prefix = isLast ? '└' : '├';
    const line = `\n${prefix} **${sub.name}** - ${sub.description}`;

    if (fieldValue.length + line.length > MAX_EMBED_FIELD_VALUE) {
      const remaining = cmd.subcommands.length - subIndex;
      const suffix = `\n… (+${remaining})`;
      const budget = MAX_EMBED_FIELD_VALUE - suffix.length;
      fieldValue = truncateEmbedText(fieldValue, budget) + suffix;
      return fieldValue;
    }

    fieldValue += line;
  }

  return truncateEmbedText(fieldValue, MAX_EMBED_FIELD_VALUE);
}

function extractSubcommands(
  commandData: Record<string, unknown>,
  lang: SupportedLanguage,
): Array<{ name: string; description: string }> | undefined {
  const subcommands: Array<{ name: string; description: string }> = [];
  const seen = new Set<string>();
  const options = commandData.options as Array<Record<string, unknown>> | undefined;

  if (!options?.length) return undefined;

  const pushSubcommand = (name: string, description: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    subcommands.push({ name, description });
  };

  for (const option of options) {
    if (option.type === 1) {
      pushSubcommand(
        resolveSlashLocalization(
          option.name as string,
          option.name_localizations as Record<string, string> | undefined,
          lang,
        ),
        resolveSlashLocalization(
          option.description as string,
          option.description_localizations as Record<string, string> | undefined,
          lang,
        ),
      );
    } else if (option.type === 2 && Array.isArray(option.options)) {
      const groupName = resolveSlashLocalization(
        option.name as string,
        option.name_localizations as Record<string, string> | undefined,
        lang,
      );
      for (const subOption of option.options as Array<Record<string, unknown>>) {
        if (subOption.type !== 1) continue;
        const subName = resolveSlashLocalization(
          subOption.name as string,
          subOption.name_localizations as Record<string, string> | undefined,
          lang,
        );
        pushSubcommand(
          `${groupName} ${subName}`,
          resolveSlashLocalization(
            subOption.description as string,
            subOption.description_localizations as Record<string, string> | undefined,
            lang,
          ),
        );
      }
    }
  }

  return subcommands.length > 0 ? subcommands : undefined;
}

function isPremiumCommand(cmd: Command): boolean {
  if (isPremiumCheckBypassed()) return false;
  if (cmd.automationSystem && !isAutomationCommandGated(cmd.automationSystem)) return false;
  return !!(cmd.automationSystem || cmd.prem || cmd.premPro || cmd.premMonthly || cmd.premUltimate || cmd.premYearly || cmd.premImmortal || cmd.premBooster);
}

function loadCommandsFromClient(
  client: ExtendedClient,
  lang: SupportedLanguage,
  filterPremium?: boolean,
): CommandInfo[] {
  const commands: CommandInfo[] = [];

  forEachUniqueCommand(client, (command) => {
    if (command.devOnly) return;

    const commandData = command.data.toJSON() as unknown as Record<string, unknown>;
    if (!commandData.description) return;

    const premium = isPremiumCommand(command);
    if (filterPremium && !premium) return;

    commands.push({
      name: resolveSlashLocalization(
        commandData.name as string,
        commandData.name_localizations as Record<string, string> | undefined,
        lang,
      ),
      description: resolveSlashLocalization(
        commandData.description as string,
        commandData.description_localizations as Record<string, string> | undefined,
        lang,
      ),
      isPremium: premium,
      subcommands: extractSubcommands(commandData, lang),
    });
  });

  return commands.sort((a, b) => a.name.localeCompare(b.name, lang));
}

function buildHelpPage(
  style: EmbedStyle,
  options: {
    title: string;
    description?: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footerText: string;
    avatarUrl: string;
  },
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS[style])
    .setTitle(options.title)
    .setTimestamp()
    .setFooter({ text: options.footerText, iconURL: options.avatarUrl });

  if (options.description) embed.setDescription(options.description);
  if (options.fields?.length) embed.addFields(options.fields);

  return embed;
}

const FILTER_CHOICES = buildLocalizedChoices('help.cmd.filter.choices', [{ value: 'premium' }]);

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows all available commands and how to use the bot')
    .setNameLocalizations(buildDiscordLocalizations('help.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('help.cmd._1'))
    .addStringOption(option =>
      option
        .setName('filter')
        .setDescription('Filter commands by category')
        .setNameLocalizations(buildDiscordLocalizations('help.cmd.filter.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('help.cmd.filter._1'))
        .addChoices(...FILTER_CHOICES),
    ),

  cooldown: 5,
  auth: false,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const lang = await getUserLanguage(userId, locale) as SupportedLanguage;
    const filter = interaction.options.getString('filter');
    const filterPremium = filter === 'premium';
    const premiumEmoji = getEmoji(interaction.client, 'premium');

    const allCommands = loadCommandsFromClient(interaction.client as ExtendedClient, lang, filterPremium || undefined);

    const totalCommands = allCommands.length;
    const totalSubcommands = allCommands.reduce(
      (sum, cmd) => sum + (cmd.subcommands?.length || 0),
      0,
    );

    const COMMANDS_PER_PAGE = 5;
    const pages: EmbedBuilder[] = [];

    const welcomeFields = filterPremium ? [] : [
      {
        name: truncateEmbedText(`**${translate('help.fields.prefixes.name', lang)}**`, MAX_EMBED_FIELD_NAME),
        value: truncateEmbedText(translate('help.fields.prefixes.value', lang), MAX_EMBED_FIELD_VALUE),
        inline: false,
      },
      {
        name: truncateEmbedText(`**${translate('help.fields.gettingStarted.name', lang)}**`, MAX_EMBED_FIELD_NAME),
        value: truncateEmbedText(translate('help.fields.gettingStarted.value', lang), MAX_EMBED_FIELD_VALUE),
        inline: false,
      },
      {
        name: truncateEmbedText(`**${translate('help.fields.howItWorks.name', lang)}**`, MAX_EMBED_FIELD_NAME),
        value: truncateEmbedText(translate('help.fields.howItWorks.value', lang), MAX_EMBED_FIELD_VALUE),
        inline: false,
      },
      {
        name: truncateEmbedText(`**${translate('help.fields.developer.name', lang)}**`, MAX_EMBED_FIELD_NAME),
        value: truncateEmbedText(translate('help.fields.developer.value', lang), MAX_EMBED_FIELD_VALUE),
        inline: false,
      },
      {
        name: truncateEmbedText(`**${translate('help.fields.supportChannel.name', lang)}**`, MAX_EMBED_FIELD_NAME),
        value: truncateEmbedText(translate('help.fields.supportChannel.value', lang), MAX_EMBED_FIELD_VALUE),
        inline: false,
      },
      {
        name: truncateEmbedText(`**${translate('help.fields.navigation.name', lang)}**`, MAX_EMBED_FIELD_NAME),
        value: truncateEmbedText(translate('help.fields.navigation.value', lang), MAX_EMBED_FIELD_VALUE),
        inline: false,
      },
    ];

    const footerText = translate('help.footer', lang, {
      commands: String(totalCommands),
      subcommands: String(totalSubcommands),
      user: interaction.user.username,
    });

    const pageStyle: EmbedStyle = filterPremium ? 'success' : 'info';
    const avatarUrl = interaction.user.displayAvatarURL();
    const premiumPrefix = premiumEmoji ? `${premiumEmoji} ` : '';

    const welcomePage = buildHelpPage(pageStyle, {
      title: filterPremium
        ? `${premiumPrefix}**${translate('help.welcome.titlePremium', lang)}**`
        : `**${translate('help.welcome.title', lang)}**`,
      description: filterPremium
        ? translate('help.welcome.descriptionPremium', lang)
        : `> ${translate('help.welcome.description', lang)}`,
      fields: welcomeFields.length > 0 ? welcomeFields : undefined,
      footerText,
      avatarUrl,
    });

    pages.push(welcomePage);

    for (let i = 0; i < allCommands.length; i += COMMANDS_PER_PAGE) {
      const commandsChunk = allCommands.slice(i, i + COMMANDS_PER_PAGE);

      const commandPage = buildHelpPage(pageStyle, {
        title: filterPremium
          ? `${premiumPrefix}**${translate('help.welcome.titlePremium', lang)}**`
          : `**${translate('help.commandList.title', lang)}**`,
        footerText,
        avatarUrl,
      });

      commandsChunk.forEach((cmd) => {
        const nameDisplay = cmd.isPremium ? `${premiumPrefix}/${cmd.name}` : `/${cmd.name}`;
        commandPage.addFields({
          name: truncateEmbedText(nameDisplay, MAX_EMBED_FIELD_NAME),
          value: buildCommandFieldValue(cmd),
          inline: false,
        });
      });

      pages.push(commandPage);
    }

    let currentPage = 0;

    const getButtons = (page: number): ActionRowBuilder<ButtonBuilder> =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('first').setLabel('◄').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('page').setLabel(`${page + 1} / ${pages.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(page === pages.length - 1),
        new ButtonBuilder().setCustomId('last').setLabel('►').setStyle(ButtonStyle.Primary).setDisabled(page === pages.length - 1),
      );

    const replyPayload = {
      embeds: [pages[currentPage]],
      components: [getButtons(currentPage)],
    };

    const response = interaction.deferred || interaction.replied
      ? await interaction.editReply(replyPayload)
      : await interaction.reply(replyPayload);

    const onlyAuthorMsg = await translateForUser(userId, 'help.onlyAuthor', undefined, locale);

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000,
    });

    collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
      if (buttonInteraction.user.id !== userId) {
        await buttonInteraction.reply({
          content: `**${onlyAuthorMsg}**`,
          ephemeral: true,
        });
        return;
      }

      switch (buttonInteraction.customId) {
        case 'first': currentPage = 0; break;
        case 'prev': currentPage = Math.max(0, currentPage - 1); break;
        case 'next': currentPage = Math.min(pages.length - 1, currentPage + 1); break;
        case 'last': currentPage = pages.length - 1; break;
      }

      await buttonInteraction.update({
        embeds: [pages[currentPage]],
        components: [getButtons(currentPage)],
      });
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // Message deleted or interaction expired
      }
    });
  },
};

export default command;
