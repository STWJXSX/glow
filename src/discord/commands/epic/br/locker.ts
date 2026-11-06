import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  ButtonInteraction,
  Client,
  ComponentType,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  AttachmentBuilder,
} from "discord.js";
import { buildDiscordLocalizations, translateForUser, getUserLanguage } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { getMainAccountAuthor, type AuthorData } from '#helpers/epic/account/avatarHandler.ts';
import {
  isR2TempUploadConfigured,
  uploadTempImageToR2,
} from '#helpers/core/cloudflare/r2TempUpload.ts';
import { isDiscordPayloadTooLargeError } from '#helpers/discord/payloadErrors.ts';
import {
  generateLockerForAccount,
  countLockerCosmetics,
  LOCKER_IMAGE_FILE_NAME,
} from '#managers/images/br/index.ts';
import { log } from '#helpers/core/logger.ts';
import type { LockerFilters } from '#managers/images/br/locker/cosmeticFilters.ts';
import {
  buildComponentsV2Payload,
  createComponentsV2Container,
  createLockerComponentsV2Container,
  type EmbedStyle,
  type LockerV2ActionRow,
} from '#helpers/core/embedHelper.ts';

// Estado actual de filtros por usuario (ahora con arrays)
interface UserFilterState {
  types: string[];
  rarities: string[];
  chapters: string[];
  exclusive: boolean;
}

const userFilterStates = new Map<string, UserFilterState>();

// Opciones de tipo de cosmético - emoji vacío para personalizar
const TYPE_OPTIONS = [
  { value: "all", label: "All Cosmetics", emoji: "" },
  { value: "outfit", label: "Outfits", emoji: "" },
  { value: "backpack", label: "Backpacks", emoji: "" },
  { value: "pickaxe", label: "Pickaxes", emoji: "" },
  { value: "glider", label: "Gliders", emoji: "" },
  { value: "emote", label: "Emotes", emoji: "" },
  { value: "spray", label: "Sprays", emoji: "" },
  { value: "emoticon", label: "Emoticons", emoji: "" },
  { value: "toy", label: "Toys", emoji: "" },
  { value: "wrap", label: "Wraps", emoji: "" },
  { value: "music", label: "Music Packs", emoji: "" },
  { value: "loadingscreen", label: "Loading Screens", emoji: "" },
  { value: "contrail", label: "Contrails", emoji: "" },
  { value: "companion", label: "Companions", emoji: "" },
  { value: "shoes", label: "Kicks", emoji: "" },
  { value: "vehicle", label: "Cars", emoji: "" },
];

// Opciones de filtros (rarity/series) - SIN exclusive
const FILTER_OPTIONS = [
  { value: "all", label: "All Rarities", emoji: "" },
  { value: "gaminglegends", label: "Gaming Legends", emoji: "" },
  { value: "marvel", label: "Marvel Series", emoji: "" },
  { value: "starwars", label: "Star Wars", emoji: "" },
  { value: "dc", label: "DC Series", emoji: "" },
  { value: "icon", label: "Icon Series", emoji: "" },
  { value: "dark", label: "Dark Series", emoji: "" },
  { value: "shadow", label: "Shadow Series", emoji: "" },
  { value: "slurp", label: "Slurp Series", emoji: "" },
  { value: "frozen", label: "Frozen Series", emoji: "" },
  { value: "lava", label: "Lava Series", emoji: "" },
  { value: "legendary", label: "Legendary", emoji: "" },
  { value: "epic", label: "Epic", emoji: "" },
  { value: "rare", label: "Rare", emoji: "" },
  { value: "uncommon", label: "Uncommon", emoji: "" },
  { value: "common", label: "Common", emoji: "" },
];

// Opciones de chapter
const CHAPTER_OPTIONS = [
  { value: "all", label: "All Chapters", emoji: "" },
  { value: "1", label: "Chapter 1", emoji: "" },
  { value: "2", label: "Chapter 2", emoji: "" },
  { value: "3", label: "Chapter 3", emoji: "" },
  { value: "4", label: "Chapter 4", emoji: "" },
  { value: "5", label: "Chapter 5", emoji: "" },
  { value: "6", label: "Chapter 6", emoji: "" },
  { value: "7", label: "Chapter 7", emoji: "" },
];

// Helper para crear opciones con emoji opcional
function createMenuOption(opt: { value: string; label: string; emoji: string }, isDefault: boolean) {
  const option = new StringSelectMenuOptionBuilder()
    .setLabel(opt.label)
    .setValue(opt.value)
    .setDefault(isDefault);
  
  if (opt.emoji && opt.emoji.length > 0) {
    option.setEmoji(opt.emoji);
  }
  
  return option;
}

// Helper para formatear labels de selección múltiple
function formatSelectedLabels(values: string[], options: { value: string; label: string }[]): string {
  if (values.includes("all")) return "All";
  if (values.length === 0) return "None";
  if (values.length <= 3) {
    return values.map(v => options.find(o => o.value === v)?.label || v).join(", ");
  }
  return `${values.length} selected`;
}

function formatLockerErrorForUser(reason: string): string {
  if (reason === 'No cosmetics match the filters') {
    return '❌ No cosmetics match the selected filters.';
  }
  if (reason === 'No se encontraron cosméticos') {
    return '❌ No cosmetics found for these types.';
  }
  const lower = reason.toLowerCase();
  if (lower.includes('heap') || lower.includes('memory') || lower.includes('alloc')) {
    return '❌ Image too large — bot ran out of memory. Try fewer cosmetic types.';
  }
  if (lower.includes('pixel') || lower.includes('dimension')) {
    return '❌ Image dimensions too large for the renderer.';
  }
  if (lower.includes('webpsave') || lower.includes('wbuffer_write') || lower.includes('unable to encode')) {
    return '❌ Image too large to encode. Try fewer cosmetic types or filters.';
  }
  return '❌ Error generating the image.';
}

function buildFilterContent(state: UserFilterState, client: Client): string {
  const typeLabel = formatSelectedLabels(state.types, TYPE_OPTIONS);
  const rarityLabel = formatSelectedLabels(state.rarities, FILTER_OPTIONS);
  const chapterLabel = formatSelectedLabels(state.chapters, CHAPTER_OPTIONS);
  const emojiSuccess = getEmoji(client, "success");
  const emojiError = getEmoji(client, "error");
  const exclusiveLabel = state.exclusive ? `${emojiSuccess} Yes` : `${emojiError} No`;

  return (
    `Select your filters and click **Generate Image**\n\n` +
    `> **Types:** ${typeLabel}\n` +
    `> **Rarities:** ${rarityLabel}\n` +
    `> **Chapters:** ${chapterLabel}\n` +
    `> **Exclusives Only:** ${exclusiveLabel}`
  );
}

function createLockerActionRows(state: UserFilterState): LockerV2ActionRow[] {
  const typeSelectMenu = new StringSelectMenuBuilder()
    .setCustomId("locker_type")
    .setPlaceholder("Select cosmetic types")
    .setMinValues(1)
    .setMaxValues(TYPE_OPTIONS.length)
    .addOptions(
      TYPE_OPTIONS.map((opt) => createMenuOption(opt, state.types.includes(opt.value))),
    );

  const filterSelectMenu = new StringSelectMenuBuilder()
    .setCustomId("locker_filter")
    .setPlaceholder("Filter by rarity/series")
    .setMinValues(1)
    .setMaxValues(FILTER_OPTIONS.length)
    .addOptions(
      FILTER_OPTIONS.map((opt) => createMenuOption(opt, state.rarities.includes(opt.value))),
    );

  const chapterSelectMenu = new StringSelectMenuBuilder()
    .setCustomId("locker_chapter")
    .setPlaceholder("Filter by chapter")
    .setMinValues(1)
    .setMaxValues(CHAPTER_OPTIONS.length)
    .addOptions(
      CHAPTER_OPTIONS.map((opt) => createMenuOption(opt, state.chapters.includes(opt.value))),
    );

  const exclusiveButton = new ButtonBuilder()
    .setCustomId("locker_exclusive")
    .setLabel(state.exclusive ? "Exclusives: ON" : "Exclusives: OFF")
    .setStyle(state.exclusive ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setEmoji("<:grieta:1360966947566653460>");

  const generateButton = new ButtonBuilder()
    .setCustomId("locker_generate")
    .setLabel("Generate Image")
    .setStyle(ButtonStyle.Primary);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(typeSelectMenu),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(filterSelectMenu),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(chapterSelectMenu),
    new ActionRowBuilder<ButtonBuilder>().addComponents(exclusiveButton, generateButton),
  ];
}

function buildLockerPanelContainer(
  state: UserFilterState,
  authorData: AuthorData | null,
  client: Client,
  style: EmbedStyle = "info",
): ContainerBuilder {
  return createLockerComponentsV2Container(
    style,
    buildFilterContent(state, client),
    createLockerActionRows(state),
    authorData,
  );
}

function buildLockerStatusContainer(
  state: UserFilterState,
  authorData: AuthorData | null,
  client: Client,
  extraContent: string,
  style: EmbedStyle,
  rows: LockerV2ActionRow[] = [],
  imageUrl?: string,
  options?: { showFilterPanel?: boolean },
): ContainerBuilder {
  const showFilterPanel = options?.showFilterPanel ?? true;
  const content = showFilterPanel
    ? `${buildFilterContent(state, client)}\n\n${extraContent}`
    : extraContent;

  const container = createComponentsV2Container({
    style,
    content,
    author: authorData,
  });

  if (imageUrl) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl),
      ),
    );
  }

  if (rows.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    for (const row of rows) {
      container.addActionRowComponents(row as never);
    }
  }

  return container;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("locker")
    .setDescription('View your Fortnite locker cosmetics with filters')
    .setNameLocalizations(buildDiscordLocalizations('locker.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('locker.cmd.description'))
    .setDMPermission(true),

  auth: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Verificar usuario y cuentas
      const user = await UsuarioInfo.findOne({ id: interaction.user.id });
      if (!user || !user.deviceAuths || user.deviceAuths.length === 0) {
        const embed = await generarEmbedError("noCuenta", { client: interaction.client, interaction });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
      if (!mainAccount) {
        const embed = await generarEmbedError("noMain", { client: interaction.client, interaction });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Obtener avatar
      const authorData = await getMainAccountAuthor(interaction.user.id);
      const uniqueKey = `${interaction.user.id}_${interaction.id}`;

      // Inicializar estado de filtros con arrays
      userFilterStates.set(uniqueKey, {
        types: ["all"],
        rarities: ["all"],
        chapters: ["all"],
        exclusive: false,
      });

      const initialState = userFilterStates.get(uniqueKey)!;

      const reply = await interaction.editReply(
        buildComponentsV2Payload(buildLockerPanelContainer(initialState, authorData ?? null, interaction.client)),
      );

      // Collector para manejar interacciones
      const collector = reply.createMessageComponentCollector({
        time: 300000, // 5 minutos
      });

      collector.on("collect", async (componentInteraction) => {
        // Solo el autor puede interactuar
        if (componentInteraction.user.id !== interaction.user.id) {
          const onlyAuthor = await translateForUser(
            interaction.user.id,
            'epic.errors.onlyAuthor',
            undefined,
            interaction.locale,
          );
          return await componentInteraction.reply({
            content: onlyAuthor,
            ephemeral: true,
          });
        }

        const currentState = userFilterStates.get(uniqueKey) || {
          types: ["all"],
          rarities: ["all"],
          chapters: ["all"],
          exclusive: false,
        };

        // Manejar SelectMenu
        if (componentInteraction.isStringSelectMenu()) {
          const selectInteraction = componentInteraction as StringSelectMenuInteraction;
          const customId = selectInteraction.customId;
          const selectedValues = selectInteraction.values;

          if (customId === "locker_type") {
            // Si se selecciona "all", solo queda "all"
            if (selectedValues.includes("all") && selectedValues.length > 1) {
              currentState.types = selectedValues.filter(v => v !== "all");
            } else {
              currentState.types = selectedValues;
            }
          } else if (customId === "locker_filter") {
            // Manejar rarezas (sin exclusive, ahora es botón separado)
            if (selectedValues.includes("all") && selectedValues.length > 1) {
              currentState.rarities = selectedValues.filter(v => v !== "all");
            } else {
              currentState.rarities = selectedValues;
            }
          } else if (customId === "locker_chapter") {
            if (selectedValues.includes("all") && selectedValues.length > 1) {
              currentState.chapters = selectedValues.filter(v => v !== "all");
            } else {
              currentState.chapters = selectedValues;
            }
          }

          userFilterStates.set(uniqueKey, currentState);

          await selectInteraction.update(
            buildComponentsV2Payload(buildLockerPanelContainer(currentState, authorData ?? null, interaction.client)),
          );

        // Manejar Button (Exclusive toggle y Generate)
        } else if (componentInteraction.isButton()) {
          const buttonInteraction = componentInteraction as ButtonInteraction;

          if (buttonInteraction.customId === "locker_exclusive") {
            // Toggle exclusive
            currentState.exclusive = !currentState.exclusive;
            userFilterStates.set(uniqueKey, currentState);

            await buttonInteraction.update(
              buildComponentsV2Payload(buildLockerPanelContainer(currentState, authorData ?? null, interaction.client)),
            );
          } else if (buttonInteraction.customId === "locker_generate") {
            await buttonInteraction.deferUpdate();

            let itemCount = 0;
            try {
              const emojiLoading = getEmoji(interaction.client, "loading");

              // Preparar filtros para generateLockerImage
              const filters: LockerFilters = {
                types: currentState.types,
                rarities: currentState.rarities,
                chapters: currentState.chapters,
                exclusive: currentState.exclusive,
              };

              const lang = (await getUserLanguage(interaction.user.id, interaction.locale)) as SupportedLanguage;

              // Contar items
              itemCount = await countLockerCosmetics(
                mainAccount.accountId,
                mainAccount.accessToken,
                currentState.types,
              );

              if (itemCount === 0) {
                await buttonInteraction.editReply(
                  buildComponentsV2Payload(
                    buildLockerStatusContainer(
                      currentState,
                      authorData ?? null,
                      interaction.client,
                      "❌ No items found for the selected types.",
                      "warning",
                      createLockerActionRows(currentState),
                    ),
                  ),
                );
                return;
              }

              // Calcular ETA
              const estimatedSeconds = Math.max(3, Math.ceil((itemCount / 534) * 7));
              const futureTimestamp = Math.floor(Date.now() / 1000) + estimatedSeconds;

              await buttonInteraction.editReply(
                buildComponentsV2Payload(
                  createComponentsV2Container({
                    style: "info",
                    content: `${emojiLoading} ${await translateForUser(
                      interaction.user.id,
                      "gateway.progress.lockerGenerating",
                      { time: `<t:${futureTimestamp}:R>`, count: itemCount },
                      interaction.locale,
                    )}`,
                    author: authorData ?? null,
                  }),
                ),
              );

              // Determinar displayName
              let finalDisplayName = mainAccount.displayName;
              if (!finalDisplayName || finalDisplayName === "IDK" || finalDisplayName === "Unknown" || finalDisplayName.trim() === "") {
                if (authorData && authorData.name && authorData.name !== "Cuenta main") {
                  finalDisplayName = authorData.name;
                } else {
                  finalDisplayName = mainAccount.accountId;
                }
              }

              log.commands.info(
                { displayName: finalDisplayName, filters, items: itemCount },
                "Generating locker image with filters"
              );

              // Generar imagen con filtros
              const imageResult = await generateLockerForAccount({
                accountId: mainAccount.accountId,
                accessToken: mainAccount.accessToken,
                displayName: finalDisplayName,
                lang,
                filters,
                discordUserId: interaction.user.id,
              });

              if (!imageResult || !imageResult.success) {
                const failureReason = imageResult?.error ?? 'unknown';
                log.commands.error(
                  {
                    error: failureReason,
                    items: itemCount,
                    filters,
                    accountId: mainAccount.accountId,
                  },
                  'Locker generateLockerForAccount returned failure',
                );

                const errorMessage = formatLockerErrorForUser(failureReason);

                await buttonInteraction.editReply(
                  buildComponentsV2Payload(
                    buildLockerStatusContainer(
                      currentState,
                      authorData ?? null,
                      interaction.client,
                      errorMessage,
                      "error",
                      createLockerActionRows(currentState),
                      undefined,
                      { showFilterPanel: false },
                    ),
                  ),
                );
                return;
              }

              // Formatear tiempo
              const totalSeconds = parseFloat(imageResult.timeSec || '0');
              const emojiSuccess = getEmoji(interaction.client, "success");

              let timeMessage: string;
              if (totalSeconds >= 60) {
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = (totalSeconds % 60).toFixed(2);
                timeMessage = `${emojiSuccess} \`${minutes}m ${seconds}s\``;
              } else {
                timeMessage = `${emojiSuccess} \`${totalSeconds}s\``;
              }

              const imageBuffer = imageResult.buffer!;
              if (!imageBuffer) {
                throw new Error('Locker image buffer missing');
              }
              const fileSizeMB = imageBuffer.length / (1024 * 1024);
              const fileName = imageResult.fileName || LOCKER_IMAGE_FILE_NAME;
              const attachment = new AttachmentBuilder(imageBuffer, { name: fileName });

              const successContent = `${timeMessage}\n-# Items: ${imageResult.count}`;
              const resultContainerOptions = { showFilterPanel: false } as const;

              const attachmentReply = buildComponentsV2Payload(
                buildLockerStatusContainer(
                  currentState,
                  authorData ?? null,
                  interaction.client,
                  successContent,
                  'success',
                  createLockerActionRows(currentState),
                  `attachment://${fileName}`,
                  resultContainerOptions,
                ),
                { files: [attachment] },
              );

              let deliveredViaR2 = false;

              try {
                await buttonInteraction.editReply(attachmentReply);
              } catch (discordError: unknown) {
                if (!isDiscordPayloadTooLargeError(discordError)) {
                  throw discordError;
                }

                log.commands.warn(
                  {
                    sizeMB: fileSizeMB.toFixed(2),
                    error: discordError instanceof Error ? discordError.message : String(discordError),
                  },
                  'Discord rejected locker attachment, trying R2',
                );

                if (!isR2TempUploadConfigured()) {
                  await buttonInteraction.editReply(
                    buildComponentsV2Payload(
                      buildLockerStatusContainer(
                        currentState,
                        authorData ?? null,
                        interaction.client,
                        `❌ **Image too large for Discord** (**${fileSizeMB.toFixed(1)}MB**).\nConfigure \`R2_*\` env vars to host it externally.`,
                        'error',
                        createLockerActionRows(currentState),
                      ),
                    ),
                  );
                } else {
                  try {
                    const imageUrl = await uploadTempImageToR2(imageBuffer, fileName, {
                      prefix: 'locker',
                      contentType: fileName.endsWith('.jpg') ? 'image/jpeg' : 'image/webp',
                    });

                    await buttonInteraction.editReply(
                      buildComponentsV2Payload(
                        buildLockerStatusContainer(
                          currentState,
                          authorData ?? null,
                          interaction.client,
                          `${successContent}\n> **URL:** [View Image](${imageUrl})`,
                          'success',
                          createLockerActionRows(currentState),
                          imageUrl,
                          resultContainerOptions,
                        ),
                      ),
                    );
                    deliveredViaR2 = true;
                  } catch (uploadError: unknown) {
                    const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
                    log.commands.error({ error: message }, 'Error uploading locker image to R2');

                    await buttonInteraction.editReply(
                      buildComponentsV2Payload(
                        buildLockerStatusContainer(
                          currentState,
                          authorData ?? null,
                          interaction.client,
                          `❌ **Upload error**\n\nDiscord rejected the file (**${fileSizeMB.toFixed(1)}MB**) and R2 upload failed.`,
                          'error',
                          createLockerActionRows(currentState),
                        ),
                      ),
                    );
                  }
                }
              }

              log.commands.info(
                {
                  filename: fileName,
                  count: imageResult.count,
                  sizeMB: fileSizeMB.toFixed(2),
                  deliveredViaR2,
                  time: totalSeconds,
                  filters,
                },
                'Locker generated successfully'
              );
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              const stack = error instanceof Error ? error.stack : undefined;
              log.commands.error({ error: message, stack, items: itemCount }, 'Error processing locker');

              await buttonInteraction.editReply(
                buildComponentsV2Payload(
                  buildLockerStatusContainer(
                    currentState,
                    authorData ?? null,
                    interaction.client,
                    "❌ Error generating the locker image.",
                    "error",
                    createLockerActionRows(currentState),
                    undefined,
                    { showFilterPanel: false },
                  ),
                ),
              );
            }
          }
        }
      });

      collector.on("end", () => {
        userFilterStates.delete(uniqueKey);
        log.commands.debug("Locker collector ended");
      });
    } catch (error: any) {
      log.commands.error({ error: error.message, stack: error.stack }, "Error in locker command");

      const errorMsg = await translateForUser(
        interaction.user.id,
        'epic.errors.unexpected',
        undefined,
        interaction.locale,
      );
      const errorContainer = createComponentsV2Container({
        style: "error",
        content: errorMsg,
      });

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(buildComponentsV2Payload(errorContainer));
        } else {
          await interaction.reply({ ...buildComponentsV2Payload(errorContainer), ephemeral: true });
        }
      } catch (replyError: any) {
        log.commands.error({ error: replyError.message }, "Error sending reply");
      }
    }
  },
};

export default command;
