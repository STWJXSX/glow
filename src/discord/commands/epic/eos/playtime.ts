import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import axios from "axios";
import crypto from "crypto";
import os from "os";
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { getLauncherTokenFromDeviceAuth } from '#helpers/epic/auth/exchangeToken.ts';
import { prepareBulkAccounts, buildBulkAuthErrorField, buildBulkAccountLabel } from '#helpers/epic/social/bulkHelper.ts';
import { guardBulkMode } from '#helpers/core/client/bulkAccess.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import { log } from '#helpers/core/logger.ts';
import {
  createInfoEmbed,
  createSuccessEmbed,
  EMBED_COLORS,
} from '#helpers/core/embedHelper.ts';

const logger = log.commands;

/**
 * Get account avatar from Epic Games
 */
async function getAccountAvatar(
  accountId: string,
  accessToken: string,
  displayName: string
): Promise<{ name: string; iconURL: string }> {
  let avatarId = null;
  try {
    const res = await axios.get(
      `https://avatar-service-prod.identity.live.on.epicgames.com/v1/avatar/fortnite/ids?accountIds=${accountId}`,
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
        },
        timeout: 10000,
      }
    );
    avatarId = Array.isArray(res.data) && res.data[0]?.avatarId ? res.data[0].avatarId : null;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch avatar");
  }

  let iconURL =
    "https://media.discordapp.net/attachments/1081977536684236880/1124346271742824599/Epic_Games_logo.png?width=412&height=478&ex=68332990&is=6831d810&hm=f6e0be48989f5fbddd8acc2ba851c15ae6277a8a7d23b42275177dca8db26004&";
  if (avatarId && avatarId.includes(":")) {
    const idPart = avatarId.split(":")[1];
    iconURL = `https://fortnite-api.com/images/cosmetics/br/${idPart}/smallicon.png`;
  }

  return {
    name: displayName || "Account",
    iconURL,
  };
}

// Artifact IDs for different games
const GAME_ARTIFACTS: Record<string, string> = {
  Fortnite: "Fortnite",
  RocketLeague: "RocketLeague",
  FallGuys: "FallGuys",
};

/**
 * Generate unique machine ID for playtime tracking
 */
async function getMachineId(): Promise<string> {
  const machineInfo = `${os.hostname()}-${os.platform()}-${os.arch()}-${Date.now()}`;
  return crypto.createHash("sha256").update(machineInfo).digest("hex").substring(0, 32);
}

/**
 * Parse time input with units (1m, 2h, 3d, 1a) - Returns minutes
 */
function parseTime(input: string): number | null {
  if (!input || input.trim() === "") {
    return null;
  }

  const inputStr = input.toString().toLowerCase().trim();
  const match = inputStr.match(/^(\d+)([mhda]?)$/);

  if (!match) {
    return null;
  }

  const cantidad = parseInt(match[1]);
  const unidad = match[2] || "h";

  if (cantidad <= 0 || isNaN(cantidad)) {
    return null;
  }

  let minutosResultado = 0;

  switch (unidad) {
    case "m":
      minutosResultado = cantidad;
      break;
    case "h":
      minutosResultado = cantidad * 60;
      break;
    case "d":
      minutosResultado = cantidad * 24 * 60;
      break;
    case "a":
      minutosResultado = cantidad * 365 * 24 * 60;
      break;
    default:
      return null;
  }

  return minutosResultado;
}

/**
 * Format time intelligently (minutes -> readable format)
 */
function formatTime(totalMinutes: number): string {
  if (totalMinutes === 0) {
    return "0m";
  }

  const años = Math.floor(totalMinutes / (365 * 24 * 60));
  const días = Math.floor((totalMinutes % (365 * 24 * 60)) / (24 * 60));
  const horas = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutos = totalMinutes % 60;

  const partes: string[] = [];

  if (años > 0) partes.push(`${años}a`);
  if (días > 0) partes.push(`${días}d`);
  if (horas > 0) partes.push(`${horas}h`);
  if (minutos > 0) partes.push(`${minutos}m`);

  return partes.join(" ");
}

/**
 * Add playtime to account
 */
async function addPlaytime(
  accessToken: string,
  accountId: string,
  minutesToAdd: number,
  artifactId: string = "Fortnite"
): Promise<boolean> {
  try {
    const machineId = await getMachineId();
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - minutesToAdd * 60 * 1000);

    const body = {
      machineId: machineId,
      artifactId: artifactId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      startSegment: true,
      endSegment: true,
    };

    const response = await axios.put(
      `${Endpoints.LIBRARY_PLAYTIME_ADD}/${accountId}`,
      body,
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.status === 204;
  } catch (error: any) {
    logger.error(
      { error: error.response?.data || error.message },
      "Error adding playtime"
    );
    return false;
  }
}

/**
 * Get current playtime for account
 */
async function getPlaytime(
  accessToken: string,
  accountId: string,
  artifactId: string
): Promise<number | null> {
  try {
    const response = await axios.get<{ totalTime: number }>(
      `${Endpoints.LIBRARY_PLAYTIME_GET}/${accountId}/artifact/${artifactId}`,
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.totalTime || 0;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return 0; // No playtime data = 0 minutes
    }
    logger.error(
      { error: error.response?.data || error.message },
      "Error getting playtime"
    );
    return null;
  }
}

/**
 * Handle revisar subcommand - Check current playtime
 */
async function handleRevisar(interaction: ChatInputCommandInteraction) {
  try {
    const user = await UsuarioInfo.findOne({ id: interaction.user.id });
    if (!user) {
      const embed = await generarEmbedError("noCuenta", { client: interaction.client });
      return await interaction.editReply({ embeds: [embed] });
    }

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) {
      const embed = await generarEmbedError("noMain", { client: interaction.client });
      return await interaction.editReply({ embeds: [embed] });
    }

    const game = interaction.options.getString("game") || "Fortnite";
    const artifactId = GAME_ARTIFACTS[game] || "Fortnite";

    logger.info(
      { displayName: mainAccount.displayName, game },
      "Checking playtime"
    );

    // Get Launcher token
    const launcherToken = await getLauncherTokenFromDeviceAuth({
      accountId: mainAccount.accountId,
      deviceId: mainAccount.deviceId,
      secret: mainAccount.secret,
      displayName: mainAccount.displayName,
    });

    if (!launcherToken) {
      const errorMsg = await translateForUser(
        interaction.user.id,
        "playtime.revisar.errors.tokenGeneration"
      );
      const embed = await generarEmbedError("custom", {
        descripcion: errorMsg,
        client: interaction.client,
      });
      return await interaction.editReply({ embeds: [embed] });
    }

    // Get current playtime
    const totalMinutes = await getPlaytime(
      launcherToken,
      mainAccount.accountId,
      artifactId
    );

    if (totalMinutes === null) {
      const errorMsg = await translateForUser(
        interaction.user.id,
        "playtime.revisar.errors.analyzeData"
      );
      const embed = await generarEmbedError("custom", {
        descripcion: errorMsg,
        client: interaction.client,
      });
      return await interaction.editReply({ embeds: [embed] });
    }

    // Get avatar
    const authorData = await getAccountAvatar(
      mainAccount.accountId,
      launcherToken,
      mainAccount.displayName
    );

    if (totalMinutes === 0) {
      const title = await translateForUser(
        interaction.user.id,
        "playtime.revisar.embed.noTime.title"
      );
      const description = await translateForUser(
        interaction.user.id,
        "playtime.revisar.embed.noTime.description",
        {
          displayName: mainAccount.displayName,
          game: game,
        }
      );

      const embed = await createInfoEmbed({
        title,
        description,
        author: authorData,
        footer: "developed",
        interaction,
      });

      return await interaction.editReply({ embeds: [embed] });
    }

    // Format time
    const timeFormatted = formatTime(totalMinutes);

    const description = await translateForUser(
      interaction.user.id,
      "playtime.revisar.embed.withTime.description",
      {
        time: timeFormatted,
        displayName: mainAccount.displayName,
        game: game,
      }
    );

    logger.info(
      { displayName: mainAccount.displayName, time: timeFormatted },
      "Playtime retrieved successfully"
    );

    const embed = await createInfoEmbed({
      description,
      author: authorData,
      footer: "developed",
      interaction,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    logger.error({ error: error.message }, "Error in revisar subcommand");
    const errorMsg = await translateForUser(
      interaction.user.id,
      "playtime.revisar.errors.unexpected"
    );
    const embed = await generarEmbedError("custom", {
      descripcion: errorMsg,
      client: interaction.client,
    });
    await interaction.editReply({ embeds: [embed] });
  }
}

/**
 * Handle añadir subcommand - Add playtime
 */
async function handleAñadir(interaction: ChatInputCommandInteraction) {
  try {
    const user = await UsuarioInfo.findOne({ id: interaction.user.id });
    if (!user) {
      const embed = await generarEmbedError("noCuenta", { client: interaction.client });
      return await interaction.editReply({ embeds: [embed] });
    }

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) {
      const embed = await generarEmbedError("noMain", { client: interaction.client });
      return await interaction.editReply({ embeds: [embed] });
    }

    const inputTime = interaction.options.getString("time", true);
    const game = interaction.options.getString("game") || "Fortnite";
    const artifactId = GAME_ARTIFACTS[game] || "Fortnite";

    // Parse time
    const minutes = parseTime(inputTime);

    if (minutes === null) {
      const errorMsg = await translateForUser(
        interaction.user.id,
        "playtime.añadir.errors.invalidFormat"
      );
      const embed = await generarEmbedError("custom", {
        descripcion: errorMsg,
        client: interaction.client,
      });
      return await interaction.editReply({ embeds: [embed] });
    }

    // Safety limit: 1 year
    const maxMinutes = 1 * 365 * 24 * 60;
    if (minutes > maxMinutes) {
      const errorMsg = await translateForUser(
        interaction.user.id,
        "playtime.añadir.errors.maxTime",
        { time: formatTime(minutes) }
      );
      const embed = await generarEmbedError("custom", {
        descripcion: errorMsg,
        client: interaction.client,
      });
      return await interaction.editReply({ embeds: [embed] });
    }

    logger.info(
      { displayName: mainAccount.displayName, time: formatTime(minutes) },
      "Adding playtime"
    );

    // Get Launcher token
    const launcherToken = await getLauncherTokenFromDeviceAuth({
      accountId: mainAccount.accountId,
      deviceId: mainAccount.deviceId,
      secret: mainAccount.secret,
      displayName: mainAccount.displayName,
    });

    if (!launcherToken) {
      const errorMsg = await translateForUser(
        interaction.user.id,
        "playtime.añadir.errors.tokenGeneration"
      );
      const embed = await generarEmbedError("custom", {
        descripcion: errorMsg,
        client: interaction.client,
      });
      return await interaction.editReply({ embeds: [embed] });
    }

    // Get current playtime
    const playtimeBefore = await getPlaytime(
      launcherToken,
      mainAccount.accountId,
      artifactId
    );

    if (playtimeBefore === null) {
      const errorMsg = await translateForUser(
        interaction.user.id,
        "playtime.añadir.errors.getCurrentTime"
      );
      const embed = await generarEmbedError("custom", {
        descripcion: errorMsg,
        client: interaction.client,
      });
      return await interaction.editReply({ embeds: [embed] });
    }

    // Add playtime
    const success = await addPlaytime(
      launcherToken,
      mainAccount.accountId,
      minutes,
      artifactId
    );

    if (!success) {
      const errorMsg = await translateForUser(
        interaction.user.id,
        "playtime.añadir.errors.addFailed"
      );
      const embed = await generarEmbedError("custom", {
        descripcion: errorMsg,
        client: interaction.client,
      });
      return await interaction.editReply({ embeds: [embed] });
    }

    // Wait for update to propagate
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Verify updated playtime
    const playtimeAfter = await getPlaytime(
      launcherToken,
      mainAccount.accountId,
      artifactId
    );

    if (playtimeAfter === null) {
      const errorMsg = await translateForUser(
        interaction.user.id,
        "playtime.añadir.errors.verifyFailed"
      );
      const embed = await generarEmbedError("custom", {
        descripcion: errorMsg,
        client: interaction.client,
      });
      return await interaction.editReply({ embeds: [embed] });
    }

    // Calculate real difference
    const realDifference = playtimeAfter - playtimeBefore;

    // Format times
    const timeBeforeFormatted = formatTime(playtimeBefore);
    const timeAfterFormatted = formatTime(playtimeAfter);
    const timeAddedFormatted = formatTime(realDifference);

    logger.info(
      {
        displayName: mainAccount.displayName,
        before: timeBeforeFormatted,
        after: timeAfterFormatted,
        added: timeAddedFormatted,
      },
      "Playtime added successfully"
    );

    // Get avatar and success emoji
    const authorData = await getAccountAvatar(
      mainAccount.accountId,
      launcherToken,
      mainAccount.displayName
    );
    const emojiSuccess = await getEmoji(interaction.client, "success");
    const emojiTimer = getEmoji(interaction.client, "timer");

    const title = await translateForUser(
      interaction.user.id,
      "playtime.añadir.embed.title",
      { timer: emojiTimer }
    );
    const description = await translateForUser(
      interaction.user.id,
      "playtime.añadir.embed.description",
      {
        added: timeAddedFormatted,
        before: timeBeforeFormatted,
        after: timeAfterFormatted,
        displayName: mainAccount.displayName,
        game: game,
      }
    );

    const embed = await createSuccessEmbed({
      title,
      description,
      author: authorData,
      footer: "developed",
      interaction,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    logger.error({ error: error.message }, "Error in añadir subcommand");
    const errorMsg = await translateForUser(
      interaction.user.id,
      "playtime.añadir.errors.unexpected"
    );
    const embed = await generarEmbedError("custom", {
      descripcion: errorMsg,
      client: interaction.client,
    });
    await interaction.editReply({ embeds: [embed] });
  }
}

// ── Bulk revisar ──────────────────────────────────────────────────────────

async function handleBulkRevisar(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
): Promise<void> {
  const client = interaction.client;
  const emojiEpic = getEmoji(client, 'epic');
  const emojiError = getEmoji(client, 'error');
  const game = interaction.options.getString("game") || "Fortnite";
  const artifactId = GAME_ARTIFACTS[game] || "Fortnite";

  const readyAccounts = await prepareBulkAccounts(interaction, user);

  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };

      const launcherToken = await getLauncherTokenFromDeviceAuth({
        accountId: account.accountId,
        deviceId: account.deviceId,
        secret: account.secret,
        displayName: account.displayName,
      });
      if (!launcherToken) return { displayName: account.displayName, isMain: account.cuentaMain, minutesOrNull: null, error: 'launcherToken' };

      const mins = await getPlaytime(launcherToken, account.accountId, artifactId);
      return { displayName: account.displayName, isMain: account.cuentaMain, minutesOrNull: mins, error: null };
    }),
  );

  const userId = interaction.user.id;
  const locale = interaction.locale;
  const fields: BulkEmbedField[] = [];
  for (const r of settled) {
    if (r.status === 'rejected') continue;
    const v = r.value;
    if ('authError' in v && v.authError) {
      fields.push(await buildBulkAuthErrorField(client, userId, v.account, v.error, locale));
      continue;
    }
    const label = buildBulkAccountLabel(client, v.displayName, v.isMain);
    if (v.minutesOrNull === null) {
      fields.push({ name: label, value: `${emojiError} \`${v.error ?? 'N/A'}\``, inline: true });
    } else {
      fields.push({ name: label, value: v.minutesOrNull === 0 ? '`0m`' : `\`${formatTime(v.minutesOrNull)}\``, inline: true });
    }
  }

  const title = await translateForUser(userId, 'playtime.bulk.title', {
    count: readyAccounts.length,
    game,
  }, locale);
  const summary = await translateForUser(userId, 'playtime.bulk.summary', undefined, locale);

  await sendBulkPaginated(interaction, title, summary, fields, 'info');
}

// ── Bulk añadir ──────────────────────────────────────────────────────────

async function handleBulkAñadir(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
): Promise<void> {
  const client = interaction.client;
  const emojiSuccess = getEmoji(client, 'success');
  const emojiError = getEmoji(client, 'error');
  const emojiEpic = getEmoji(client, 'epic');

  const inputTime = interaction.options.getString("time", true);
  const game = interaction.options.getString("game") || "Fortnite";
  const artifactId = GAME_ARTIFACTS[game] || "Fortnite";
  const minutes = parseTime(inputTime);

  if (minutes === null) {
    const embed = await generarEmbedError("custom", {
      descripcion: await translateForUser(interaction.user.id, "playtime.añadir.errors.invalidFormat"),
      client,
    });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const readyAccounts = await prepareBulkAccounts(interaction, user);

  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };

      const launcherToken = await getLauncherTokenFromDeviceAuth({
        accountId: account.accountId,
        deviceId: account.deviceId,
        secret: account.secret,
        displayName: account.displayName,
      });
      if (!launcherToken) return { displayName: account.displayName, isMain: account.cuentaMain, succeeded: false, error: 'launcherToken' };

      const success = await addPlaytime(launcherToken, account.accountId, minutes, artifactId);
      return { displayName: account.displayName, isMain: account.cuentaMain, succeeded: success, error: success ? null : 'addFailed' };
    }),
  );

  const fields: BulkEmbedField[] = [];
  let ok = 0;
  let fail = 0;

  for (const r of settled) {
    if (r.status === 'rejected') { fail++; continue; }
    const v = r.value;
    if ('authError' in v && v.authError) {
      fail++;
      fields.push(await buildBulkAuthErrorField(client, interaction.user.id, v.account, v.error, interaction.locale));
      continue;
    }
    const label = buildBulkAccountLabel(client, v.displayName, v.isMain);
    if (v.succeeded) {
      ok++;
      fields.push({ name: label, value: `${emojiSuccess} +${formatTime(minutes)}`, inline: true });
    } else {
      fail++;
      fields.push({ name: label, value: `${emojiError} \`${v.error}\``, inline: true });
    }
  }

  const userId = interaction.user.id;
  const locale = interaction.locale;
  const title = await translateForUser(userId, 'playtime.bulk.title', {
    count: readyAccounts.length,
    game,
  }, locale);
  const summary = await translateForUser(userId, 'playtime.bulk.addSummary', {
    time: formatTime(minutes),
    ok: String(ok),
    fail: String(fail),
  }, locale);

  await sendBulkPaginated(interaction, title, summary, fields, 'info');
}

const GAME_CHOICES = [
  {
    name: 'Fortnite',
    value: 'Fortnite',
    name_localizations: buildDiscordLocalizations('playtime.cmd.choices.fortnite'),
  },
  {
    name: 'Rocket League',
    value: 'RocketLeague',
    name_localizations: buildDiscordLocalizations('playtime.cmd.choices.rocketLeague'),
  },
  {
    name: 'Fall Guys',
    value: 'FallGuys',
    name_localizations: buildDiscordLocalizations('playtime.cmd.choices.fallGuys'),
  },
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('playtime')
    .setDescription('Manage your Fortnite playtime')
    .setNameLocalizations(buildDiscordLocalizations('playtime.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('playtime.cmd.description'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('revisar')
        .setDescription('Check your current playtime')
        .setNameLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.revisar.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.revisar.description'))
        .addStringOption((option) =>
          option
            .setName('game')
            .setDescription('The game to check playtime for')
            .setNameLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.revisar.options.game.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.revisar.options.game.description'))
            .setRequired(false)
            .addChoices(...GAME_CHOICES),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('bulk')
            .setDescription('Check playtime for all your accounts')
            .setNameLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.revisar.options.bulk.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.revisar.options.bulk.description'))
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('añadir')
        .setDescription('Add playtime to your account')
        .setNameLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.añadir.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.añadir.description'))
        .addStringOption((option) =>
          option
            .setName('time')
            .setDescription('Time to add: 30m, 2h, 5d, 1a (default: hours)')
            .setNameLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.añadir.options.time.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.añadir.options.time.description'))
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('game')
            .setDescription('The game to add playtime to')
            .setNameLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.añadir.options.game.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.añadir.options.game.description'))
            .setRequired(false)
            .addChoices(...GAME_CHOICES),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('bulk')
            .setDescription('Add playtime to all your accounts')
            .setNameLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.añadir.options.bulk.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('playtime.cmd.subcommands.añadir.options.bulk.description'))
            .setRequired(false),
        ),
    )
    .setDMPermission(true),
  
  auth: true,
  prem: true,

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const bulk = interaction.options.getBoolean("bulk") ?? false;

    if (bulk) {
      if (!await guardBulkMode(interaction)) return;
      const user = await UsuarioInfo.findOne({ id: interaction.user.id });
      if (!user) {
        const embed = await generarEmbedError("noCuenta", { client: interaction.client });
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      if (subcommand === "revisar") { await handleBulkRevisar(interaction, user); return; }
      if (subcommand === "añadir") { await handleBulkAñadir(interaction, user); return; }
    }

    if (subcommand === "revisar") {
      await handleRevisar(interaction);
    } else if (subcommand === "añadir") {
      await handleAñadir(interaction);
    }
  },
};

export default command;
