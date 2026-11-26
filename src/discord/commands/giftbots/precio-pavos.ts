import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import {
  VBUCKS_PRICE_TIERS,
  formatEuro,
  quoteVbucksPurchase,
  saleEurPer1k,
} from '#giftbots/vbucksPricing.ts';
import {
  buildEpicReplyPayload,
  replyWithEpicEmbed,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('vbucks-price')
    .setDescription('V-Bucks sale price and margin (Mercadona tiers)')
    .setNameLocalizations(buildDiscordLocalizations('giftbotsPrecioPavos.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('giftbotsPrecioPavos.cmd.description'))
    .addSubcommand((sc) =>
      sc
        .setName('calculate')
        .setDescription('Price for a V-Bucks amount')
        .setNameLocalizations(
          buildDiscordLocalizations('giftbotsPrecioPavos.cmd.subcommands.calculate.name'),
        )
        .setDescriptionLocalizations(
          buildDiscordLocalizations('giftbotsPrecioPavos.cmd.subcommands.calculate.description'),
        )
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('V-Bucks amount')
            .setNameLocalizations(
              buildDiscordLocalizations(
                'giftbotsPrecioPavos.cmd.subcommands.calculate.options.amount.name',
              ),
            )
            .setDescriptionLocalizations(
              buildDiscordLocalizations(
                'giftbotsPrecioPavos.cmd.subcommands.calculate.options.amount.description',
              ),
            )
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(500_000),
        )
        .addNumberOption((o) =>
          o
            .setName('fee')
            .setDescription('Estimated payment fee (€), default 0.35')
            .setNameLocalizations(
              buildDiscordLocalizations(
                'giftbotsPrecioPavos.cmd.subcommands.calculate.options.fee.name',
              ),
            )
            .setDescriptionLocalizations(
              buildDiscordLocalizations(
                'giftbotsPrecioPavos.cmd.subcommands.calculate.options.fee.description',
              ),
            )
            .setMinValue(0)
            .setMaxValue(50),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('packages')
        .setDescription('Fixed packages (800 · 2,400 · 4,500 · 12,500)')
        .setNameLocalizations(
          buildDiscordLocalizations('giftbotsPrecioPavos.cmd.subcommands.packages.name'),
        )
        .setDescriptionLocalizations(
          buildDiscordLocalizations('giftbotsPrecioPavos.cmd.subcommands.packages.description'),
        ),
    ) as any,

  auth: false,
  cooldown: 3,

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const client = interaction.client;
    const vbucksEmoji = getEmoji(client, 'vbucks');

    if (sub === 'packages' || sub === 'paquetes') {
      const lines = await Promise.all(
        VBUCKS_PRICE_TIERS.map(async (t) => {
          const ratio = saleEurPer1k(t.vbucks, t.saleEur);
          const margin = t.saleEur - t.baseEur;
          return translateForUser(
            userId,
            'giftbotsPrecioPavos.paquetes.line',
            {
              vbucks: t.vbucks.toLocaleString('en-US'),
              emoji: vbucksEmoji,
              sale: formatEuro(t.saleEur),
              base: formatEuro(t.baseEur),
              margin: formatEuro(margin),
              ratio: ratio.toFixed(2).replace('.', ','),
            },
            locale,
          );
        }),
      );

      const title = await translateForUser(userId, 'giftbotsPrecioPavos.paquetes.title', undefined, locale);
      const description = await translateForUser(
        userId,
        'giftbotsPrecioPavos.paquetes.description',
        { basePer1k: formatEuro(2.55) },
        locale,
      );
      const fieldName = await translateForUser(userId, 'giftbotsPrecioPavos.paquetes.fieldName', undefined, locale);

      const payload = await buildEpicReplyPayload(
        userId,
        {
          style: 'info',
          title,
          description,
          fields: [{ name: fieldName, value: lines.join('\n\n'), inline: false }],
          footerKey: 'brand',
        },
        interaction,
        locale,
      );

      await interaction.editReply(payload);
      return;
    }

    const cantidad =
      interaction.options.getInteger('amount') ?? interaction.options.getInteger('cantidad', true);
    const comision =
      interaction.options.getNumber('fee') ?? interaction.options.getNumber('comision') ?? 0.35;
    const q = quoteVbucksPurchase(cantidad, comision);

    const title = await translateForUser(userId, 'giftbotsPrecioPavos.calculate.title', undefined, locale);
    const afterFeeValue = await translateForUser(
      userId,
      'giftbotsPrecioPavos.calculate.fields.afterFeeValue',
      { fee: formatEuro(q.feeEur), net: formatEuro(q.netAfterFeeEur) },
      locale,
    );

    const [clientPays, baseCost, grossMargin, saleRatio, costRatio, afterFee] = await Promise.all([
      translateForUser(userId, 'giftbotsPrecioPavos.calculate.fields.clientPays', undefined, locale),
      translateForUser(userId, 'giftbotsPrecioPavos.calculate.fields.baseCost', undefined, locale),
      translateForUser(userId, 'giftbotsPrecioPavos.calculate.fields.grossMargin', undefined, locale),
      translateForUser(userId, 'giftbotsPrecioPavos.calculate.fields.saleRatio', undefined, locale),
      translateForUser(userId, 'giftbotsPrecioPavos.calculate.fields.costRatio', undefined, locale),
      translateForUser(userId, 'giftbotsPrecioPavos.calculate.fields.afterFee', undefined, locale),
    ]);

    const footer = await translateForUser(userId, 'giftbotsPrecioPavos.calculate.footer', undefined, locale);

    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      title,
      description:
        `**${q.vbucks.toLocaleString('en-US')}** ${vbucksEmoji}` +
        (q.nearestTierLabel ? `\n-# ${q.nearestTierLabel}` : ''),
      fields: [
        { name: clientPays, value: `**${formatEuro(q.saleEur)}**`, inline: true },
        { name: baseCost, value: `**${formatEuro(q.baseEur)}**`, inline: true },
        { name: grossMargin, value: `**${formatEuro(q.grossProfitEur)}**`, inline: true },
        {
          name: saleRatio,
          value: `**${q.salePer1k.toFixed(2).replace('.', ',')} € / 1.000**`,
          inline: true,
        },
        {
          name: costRatio,
          value: `**${q.basePer1k.toFixed(2).replace('.', ',')} € / 1.000**`,
          inline: true,
        },
        { name: afterFee, value: afterFeeValue, inline: true },
      ],
      footerText: footer,
      footerKey: 'none',
    });
  },
};

export default command;
