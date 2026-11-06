/**
 * COMANDO /BATTLEPASS
 * Reclama de golpe las recompensas de los pases de temporada BR
 * (Pase de batalla, LEGO, Musical y OG) con la moneda disponible.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, type Client } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import {
  buildDiscordLocalizations,
  buildLocalizedChoices,
  translateForUser,
} from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { guardBulkMode } from '#helpers/core/client/bulkAccess.ts';
import {
  prepareBulkAccounts,
  buildBulkAuthErrorField,
  buildBulkAccountLabel,
} from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import type { Command } from '#structures/types.ts';
import {
  buildEpicEmbed,
  buildEpicReplyPayload,
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicApiError,
  replyEpicCustomError,
  getEpicAuthor,
  epicEmojiLine,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  loadSeasonPassCatalog,
  type SeasonPassCatalog,
  type SeasonPassKind,
} from '#helpers/epic/br/seasonPasses/seasonPassCatalog.ts';
import {
  claimSeasonPassRewards,
  type PassClaimResult,
  type SeasonPassClaimResult,
} from '#helpers/epic/br/seasonPasses/seasonPassClaim.ts';

const PASS_CHOICES = ['all', 'battle', 'lego', 'music', 'og'] as const;
type PassChoice = (typeof PASS_CHOICES)[number];

/** Currencies worth showing after a claim, in display order. */
const SHOWN_CURRENCIES = [
  'accountresource:athenabattlestar',
  'accountresource:athenacategorystar',
  'accountresource:junoseasonpasscurrency',
  'accountresource:musicpassnote',
  'accountresource:figmentpass_currency',
] as const;

const MAX_LISTED_REWARDS = 8;

function resolveKinds(choice: PassChoice): ReadonlySet<SeasonPassKind> | undefined {
  return choice === 'all' ? undefined : new Set<SeasonPassKind>([choice]);
}

function t(userId: string, key: string, locale: string, vars?: Record<string, string | number>): Promise<string> {
  return translateForUser(userId, `battlepass.${key}`, vars, locale);
}

async function passLabel(userId: string, locale: string, pass: PassClaimResult): Promise<string> {
  return t(userId, `kinds.${pass.kind}`, locale);
}

/** One field per pass for the single-account embed. */
async function buildPassField(
  client: Client,
  userId: string,
  locale: string,
  pass: PassClaimResult,
): Promise<BulkEmbedField> {
  const name = await passLabel(userId, locale, pass);

  if (!pass.active) {
    return { name, value: epicEmojiLine(client, 'info', await t(userId, 'claim.inactive', locale)), inline: false };
  }

  const lines: string[] = [];
  if (pass.claimed.length > 0) {
    lines.push(epicEmojiLine(client, 'success', await t(userId, 'claim.claimed', locale, { count: pass.claimed.length })));
    const names = pass.claimed.map((r) => r.name ?? r.offerId);
    const shown = names.slice(0, MAX_LISTED_REWARDS).map((n) => `> ${n}`);
    if (names.length > MAX_LISTED_REWARDS) {
      shown.push(`> ${await t(userId, 'claim.more', locale, { count: names.length - MAX_LISTED_REWARDS })}`);
    }
    lines.push(...shown);
  } else if (pass.remaining === 0) {
    lines.push(epicEmojiLine(client, 'success', await t(userId, 'claim.allClaimed', locale)));
  } else {
    lines.push(epicEmojiLine(client, 'info', await t(userId, 'claim.nothingToClaim', locale)));
  }

  if (pass.remaining > 0) lines.push(await t(userId, 'claim.remaining', locale, { count: pass.remaining }));
  if (pass.rejected > 0) {
    lines.push(epicEmojiLine(client, 'warning', await t(userId, 'claim.rejected', locale, { count: pass.rejected })));
    lines.push(...pass.errors.map((e) => `> -# ${e.slice(0, 180)}`));
  }
  if (!pass.premium) lines.push(await t(userId, 'claim.notPremium', locale));

  return { name, value: lines.join('\n').slice(0, 1024), inline: false };
}

async function buildBalanceLine(
  userId: string,
  locale: string,
  result: SeasonPassClaimResult,
): Promise<string | null> {
  const parts: string[] = [];
  for (const currency of SHOWN_CURRENCIES) {
    const amount = result.balances[currency];
    if (amount === undefined) continue;
    const label = await t(userId, `currency.${currency.split(':')[1]}`, locale);
    parts.push(`${label}: \`${amount}\``);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Accounts processed at once: fast enough for big lists, gentle enough not to get throttled. */
const BULK_CONCURRENCY = 3;
/** Cap per account so one stuck account cannot hold the whole run (MCP calls have their own timeout). */
const ACCOUNT_TIMEOUT_MS = 90_000;
/** Discord rate-limits message edits; one progress edit every couple of seconds is plenty. */
const PROGRESS_EDIT_INTERVAL_MS = 2_000;

class AccountTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AccountTimeoutError()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Loading embed that keeps the user informed while a bulk run is in progress. */
function createProgressReporter(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  let attached = false;
  let lastEdit = 0;
  let pending: Promise<unknown> = Promise.resolve();

  return (description: string, force = false): void => {
    const now = Date.now();
    if (!force && now - lastEdit < PROGRESS_EDIT_INTERVAL_MS) return;
    lastEdit = now;

    pending = pending.then(async () => {
      const input = { style: 'info' as const, description, footerKey: 'brand' as const, loading: true };
      if (!attached) {
        // First edit uploads the loading GIF; later edits reuse the attachment.
        attached = true;
        await interaction.editReply(await buildEpicReplyPayload(userId, input, interaction, locale));
      } else {
        await interaction.editReply({ embeds: [await buildEpicEmbed(userId, input, interaction, locale)] });
      }
    }).catch(() => { /* progress is best effort */ });
  };
}

async function handleBulkClaim(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
  catalog: SeasonPassCatalog,
  kinds: ReadonlySet<SeasonPassKind> | undefined,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const report = createProgressReporter(interaction);

  report(await t(userId, 'bulk.preparing', locale, { count: user.deviceAuths.length }), true);
  const readyAccounts = await prepareBulkAccounts(interaction, user);

  const fields: BulkEmbedField[] = new Array(readyAccounts.length);
  let ok = 0;
  let fail = 0;
  let total = 0;
  let done = 0;
  let next = 0;

  const processAccount = async (index: number): Promise<void> => {
    const { account, ok: ready, error: authErr } = readyAccounts[index];
    if (!ready) {
      fail++;
      fields[index] = await buildBulkAuthErrorField(client, userId, account, authErr, locale);
      return;
    }

    const label = buildBulkAccountLabel(client, account.displayName, account.cuentaMain);
    try {
      const result = await withTimeout(claimSeasonPassRewards(account, catalog, { kinds }), ACCOUNT_TIMEOUT_MS);
      ok++;
      const lines: string[] = [];
      for (const pass of result.passes) {
        if (!pass.active) continue;
        total += pass.claimed.length;
        lines.push(await t(userId, 'bulk.line', locale, {
          pass: await passLabel(userId, locale, pass),
          count: pass.claimed.length,
        }));
      }
      fields[index] = {
        name: label,
        value: lines.length > 0
          ? epicEmojiLine(client, 'success', lines.join('\n'))
          : epicEmojiLine(client, 'info', await t(userId, 'claim.inactive', locale)),
        inline: true,
      };
    } catch (err: any) {
      fail++;
      const timedOut = err instanceof AccountTimeoutError || err?.response === undefined && /timeout/i.test(err?.message ?? '');
      log.epic.warn({ err: err?.message, accountId: account.accountId, timedOut }, '[battlepass] Bulk claim failed');
      fields[index] = {
        name: label,
        value: epicEmojiLine(
          client,
          'error',
          timedOut
            ? await t(userId, 'claim.timeout', locale)
            : (err?.errorData?.errorMessage ?? err?.message ?? 'Error'),
        ),
        inline: true,
      };
    }
  };

  const worker = async (): Promise<void> => {
    while (next < readyAccounts.length) {
      const index = next++;
      const name = readyAccounts[index].account.displayName;
      report(await t(userId, 'bulk.progress', locale, { current: done + 1, total: readyAccounts.length, name }));
      await processAccount(index);
      done++;
    }
  };

  await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, readyAccounts.length) }, worker));

  const title = await t(userId, 'bulk.title', locale, { count: readyAccounts.length });
  const summary = await t(userId, 'bulk.summary', locale, { rewards: total, ok, fail });
  await sendBulkPaginated(interaction, title, summary, fields.filter(Boolean), 'success');
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('battlepass')
    .setDescription('Battle Pass and season pass rewards')
    .setNameLocalizations(buildDiscordLocalizations('battlepass.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('battlepass.cmd.description'))
    .setDMPermission(true)
    .addSubcommand((sub) =>
      sub
        .setName('claim')
        .setDescription('Claim every pass reward you can afford')
        .setNameLocalizations(buildDiscordLocalizations('battlepass.cmd.subcommands.claim.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('battlepass.cmd.subcommands.claim.description'))
        .addStringOption((opt) =>
          opt
            .setName('pass')
            .setDescription('Which pass to claim (default: all)')
            .setNameLocalizations(buildDiscordLocalizations('battlepass.cmd.subcommands.claim.options.pass.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('battlepass.cmd.subcommands.claim.options.pass.description'))
            .setRequired(false)
            .addChoices(...buildLocalizedChoices('battlepass.cmd.choices', PASS_CHOICES.map((value) => ({ value })))),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('bulk')
            .setDescription('Claim on all your linked accounts')
            .setNameLocalizations(buildDiscordLocalizations('battlepass.cmd.subcommands.claim.options.bulk.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('battlepass.cmd.subcommands.claim.options.bulk.description'))
            .setRequired(false),
        ),
    ) as SlashCommandBuilder,

  auth: true,
  nodefer: false,
  cooldown: 15,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const client = interaction.client;
    const locale = interaction.locale;

    if (interaction.options.getSubcommand() !== 'claim') return;

    const choice = (interaction.options.getString('pass') ?? 'all') as PassChoice;
    const kinds = resolveKinds(choice);
    const bulk = interaction.options.getBoolean('bulk') ?? false;

    if (bulk && !await guardBulkMode(interaction)) return;

    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    let catalog: SeasonPassCatalog;
    try {
      catalog = await loadSeasonPassCatalog();
    } catch (error) {
      log.epic.error({ error }, '[battlepass] Season pass catalog unavailable');
      await replyEpicCustomError(interaction, userId, 'battlepass.claim.catalogUnavailable');
      return;
    }

    if (bulk) return handleBulkClaim(interaction, user, catalog, kinds);

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    try {
      const authorData = await getEpicAuthor(userId, {
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
        displayName: mainAccount.displayName,
      });

      const result = await claimSeasonPassRewards(mainAccount, catalog, { kinds });
      const total = result.passes.reduce((sum, p) => sum + p.claimed.length, 0);
      log.epic.info(`Season pass claim for ${mainAccount.displayName}: ${total} rewards`);

      const fields = await Promise.all(result.passes.map((pass) => buildPassField(client, userId, locale, pass)));
      const balance = await buildBalanceLine(userId, locale, result);
      if (balance) fields.push({ name: await t(userId, 'claim.balances', locale), value: balance, inline: false });

      await replyWithEpicEmbed(interaction, userId, {
        style: total > 0 ? 'success' : 'info',
        title: await t(userId, 'claim.title', locale),
        fields,
        author: authorData,
        footerKey: 'brand',
      });
    } catch (error: unknown) {
      log.epic.error({ error }, 'Error claiming season pass rewards');
      await replyEpicApiError(interaction, userId, error);
    }
  },
};

export default command;
