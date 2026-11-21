import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, escapeMarkdown, Events, MessageFlags, StringSelectMenuBuilder,
} from 'discord.js';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import { hasPaidPremium } from '#helpers/core/client/premium.ts';
import { FNCHAT_ACTIVATE_BUTTON_ID } from '#helpers/core/commandsDoc.ts';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { BotEvent } from '#structures/types.ts';

const SELECT_ID = 'glow_fnchat_account';
const PAGE_PREFIX = 'glow_fnchat_page:';
const PAGE_SIZE = 25;

type ActivationResult =
  | { status: 'ready'; botName: string; welcomeSent: boolean }
  | { status: 'account' | 'blocked' | 'busy' | 'failed' | 'offline' | 'pending' | 'premium' };

const messages = {
  account: ['Link or renew your Epic account with `/login` and try again.', 'Vincula o renueva tu cuenta de Epic con `/login` y vuelve a intentarlo.'],
  blocked: ['Your account cannot use this feature.', 'Tu cuenta no puede usar esta función.'],
  busy: ['This account is already being activated.', 'La activación de esta cuenta ya está en curso.'],
  failed: ['Epic could not complete the friendship. Check your friend request settings and try again.', 'Epic no pudo completar la amistad. Revisa los ajustes de solicitudes de amistad y vuelve a intentarlo.'],
  offline: ['Fortnite chat is temporarily offline. Try again in a moment.', 'El chat de Fortnite no está disponible ahora mismo. Inténtalo en un momento.'],
  pending: ['The Epic friend request is pending. Try the button again in a moment.', 'La solicitud de amistad de Epic está pendiente. Vuelve a pulsar el botón en un momento.'],
  premium: ['Fortnite chat requires Glow Premium.', 'El chat de Fortnite requiere Glow Premium.'],
} as const;

const event: BotEvent<'interactionCreate'> = {
  name: Events.InteractionCreate,
  once: false,

  async execute(_client, interaction) {
    const open = interaction.isButton() && interaction.customId === FNCHAT_ACTIVATE_BUTTON_ID;
    const pageButton = interaction.isButton() && interaction.customId.startsWith(PAGE_PREFIX);
    const select = interaction.isStringSelectMenu() && interaction.customId === SELECT_ID;
    if (!open && !pageButton && !select) return;

    const es = interaction.locale.startsWith('es');
    const languageIndex = es ? 1 : 0;
    if (open) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    else await interaction.deferUpdate();

    const reply = (content: string) => interaction.editReply({ content, components: [], allowedMentions: { parse: [] } });

    try {
      const userId = interaction.user.id;
      if (select) {
        const accountId = interaction.values[0];
        if (!accountId) return void await reply(messages.account[languageIndex]);
        await reply(es ? 'Conectando con Fortnite…' : 'Connecting to Fortnite…');
        const result = await callCoreWithTimeout<ActivationResult>('fnchat.activate', 90_000, userId, accountId);
        if (result.status !== 'ready') return void await reply(messages[result.status][languageIndex]);

        const bot = escapeMarkdown(result.botName);
        const next = result.welcomeSent
          ? (es ? 'Abre el mensaje de bienvenida en Fortnite.' : 'Open the welcome message in Fortnite.')
          : (es ? 'Búscalo en la lista de amigos de Fortnite.' : 'Find it in your Fortnite friends list.');
        await reply(es
          ? `**${bot}** ya está en tu lista de amigos. ${next} Prueba con \`!vbucks\`.`
          : `**${bot}** is in your friends list. ${next} Try \`!vbucks\`.`);
        return;
      }

      const user = await UsuarioInfo.findOne({ id: userId }).select('aceptarTOS deviceAuths.accountId deviceAuths.displayName');
      if (!user?.aceptarTOS || !user.deviceAuths?.length) return void await reply(messages.account[languageIndex]);
      if (!await hasPaidPremium(userId)) return void await reply(messages.premium[languageIndex]);

      const accounts = user.deviceAuths;
      const lastPage = Math.ceil(accounts.length / PAGE_SIZE) - 1;
      const requested = pageButton ? Number(interaction.customId.slice(PAGE_PREFIX.length)) : 0;
      const page = Number.isInteger(requested) ? Math.max(0, Math.min(requested, lastPage)) : 0;
      const menu = new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID)
        .setPlaceholder(es ? 'Selecciona tu cuenta de Epic' : 'Select your Epic account')
        .addOptions(accounts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((account) => ({
          label: (account.displayName || account.accountId).slice(0, 100),
          value: account.accountId,
        })));
      const components: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> = [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      ];
      if (lastPage > 0) {
        components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`${PAGE_PREFIX}${page - 1}`).setLabel(es ? 'Anterior' : 'Previous')
            .setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId(`${PAGE_PREFIX}${page + 1}`).setLabel(es ? 'Siguiente' : 'Next')
            .setStyle(ButtonStyle.Secondary).setDisabled(page === lastPage),
        ));
      }
      await interaction.editReply({
        content: es
          ? 'Selecciona la cuenta de Epic desde la que autorizas a Glow a añadir su bot como amigo.'
          : 'Select the Epic account you authorize Glow to use to add its Fortnite bot as a friend.',
        components,
      });
    } catch (err) {
      log.bot.warn({ error: err instanceof Error ? err.name : undefined }, '[FN-CHAT] Activation interaction failed');
      await reply(messages.offline[languageIndex]);
    }
  },
};

export default event;
