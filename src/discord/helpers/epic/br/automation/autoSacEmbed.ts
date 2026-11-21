import type { Client, EmbedBuilder } from 'discord.js';
import type { ExtendedClient } from '#structures/types.ts';
import { getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicEmbed,
  epicQuote,
  epicSection,
  getEpicAuthor,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import type { AutoBuyAccountContext } from './autoBuyEmbed.ts';

function asInteractionStub(client: Client) {
  return { client, locale: null } as unknown as Parameters<typeof buildEpicEmbed>[2];
}

export async function buildAutoSacNotificationEmbed(
  client: ExtendedClient,
  discordId: string,
  input: {
    kind: 'success' | 'error';
    account: AutoBuyAccountContext;
    sacCode: string;
    errorMessage?: string;
  },
): Promise<EmbedBuilder> {
  const lang = await getUserLanguage(discordId);
  const stub = asInteractionStub(client);
  const keyPrefix = 'autosac.dm';

  const author = await getEpicAuthor(discordId, {
    accountId: input.account.accountId,
    accessToken: input.account.accessToken,
    displayName: input.account.displayName,
  });

  const descriptionKey =
    input.kind === 'success' ? `${keyPrefix}.success.description` : `${keyPrefix}.error.description`;

  const lines = [
    await translateForUser(discordId, descriptionKey, {
      displayName: input.account.displayName,
      sac: input.sacCode,
    }, lang),
    '',
    epicSection(await translateForUser(discordId, `${keyPrefix}.label_code`, undefined, lang)),
    epicQuote(`**${input.sacCode}**`),
  ];

  if (input.kind === 'error' && input.errorMessage) {
    const reasonLabel = await translateForUser(discordId, `${keyPrefix}.error.reason`, undefined, lang);
    lines.push('', epicSection(reasonLabel), epicQuote(input.errorMessage));
  }

  const titleKey = input.kind === 'success' ? `${keyPrefix}.success.title` : `${keyPrefix}.error.title`;

  return buildEpicEmbed(
    discordId,
    {
      style: input.kind === 'success' ? 'success' : 'error',
      title: await translateForUser(discordId, titleKey, undefined, lang),
      description: lines.join('\n'),
      author,
      footerKey: 'brand',
    },
    stub,
    lang,
  );
}
