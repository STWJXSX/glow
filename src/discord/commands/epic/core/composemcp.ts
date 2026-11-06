/**
 * COMANDO /COMPOSEMCP
 * Ejecuta operaciones MCP personalizadas en tu cuenta principal.
 * Schema basado en el Glow Launcher — incluye todos los campos del payload.
 */

import {
  SlashCommandBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  AttachmentBuilder,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { EmojiHelper } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import axios from 'axios';
import {
  replyEpicCredentialError,
  getEpicAuthor,
  translateEpic,
  buildEpicReplyPayload,
  replyWithEpicEmbed,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import {
  EPIC_PANEL_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';

// ─── Types ────────────────────────────────────────────────────

interface FieldDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
}

interface OpSchema {
  profileId: string; // pipe-separated, first is default
  payload: FieldDef[];
  notes?: string;
}

// ─── Operations Schema ────────────────────────────────────────

const OPERATIONS_SCHEMA: Record<string, OpSchema> = {
  AbandonExpedition: {
    profileId: 'campaign',
    payload: [
      { name: 'expeditionId', type: 'string', required: true, description: 'Expedition Item GUID' },
    ],
  },
  ActivateConsumable: {
    profileId: 'theater0',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Consumable Item GUID' },
      { name: 'quantity', type: 'number', required: true, description: 'Amount to consume' },
      { name: 'consumeImmediately', type: 'boolean', required: false, description: 'Consume right away. Default: false' },
    ],
    notes: 'profileId can be theater0, theater1, or theater2',
  },
  ApplyAlteration: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'alterationId', type: 'string', required: true, description: 'Alteration Template Id, e.g. Alteration:aid_att_damage_t05' },
      { name: 'alterationSlot', type: 'number', required: true, description: 'Index of the alteration slot' },
    ],
  },
  AssignWorkerToSquad: {
    profileId: 'campaign',
    payload: [
      { name: 'squadId', type: 'string', required: true, description: 'Squad Id, e.g. Squad_Attribute_Medicine_EMTSquad' },
      { name: 'slotIdx', type: 'number', required: true, description: 'Slot index within the squad' },
      { name: 'itemId', type: 'string', required: true, description: 'Survivor Item GUID' },
    ],
  },
  AssignWorkerToSquadBatch: {
    profileId: 'campaign',
    payload: [
      { name: 'assignments', type: 'array', required: true, description: 'Array of {squadId: string, slotIdx: number, itemId: string}' },
    ],
  },
  ChallengeBundleLevelUp: {
    profileId: 'athena',
    payload: [
      { name: 'bundleId', type: 'string', required: true, description: 'Challenge Bundle GUID' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  ClaimCollectedResources: {
    profileId: 'campaign',
    payload: [
      { name: 'diffId', type: 'string', required: false, description: 'Diff Id (usually empty)' },
    ],
    notes: 'profileId can be campaign, theater0, theater1, or theater2',
  },
  ClaimCollectionBookPageRewards: {
    profileId: 'campaign',
    payload: [
      { name: 'pageTemplateId', type: 'string', required: true, description: 'Collection Book Page Template Id' },
      { name: 'rewardItemId', type: 'string', required: false, description: 'Reward Item GUID (if multiple rewards exist)' },
    ],
  },
  ClaimCollectionBookRewards: {
    profileId: 'campaign',
    payload: [
      { name: 'level', type: 'number', required: true, description: 'Collection Book Level to claim reward for' },
    ],
  },
  ClaimDifficultyIncreaseRewards: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required',
  },
  ClaimLoginReward: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. profileId can be campaign or athena.',
  },
  ClaimMfaEnabled: {
    profileId: 'common_core',
    payload: [
      { name: 'bClaimForStw', type: 'boolean', required: true, description: 'true to claim the StW Hero reward, false for BR reward' },
    ],
  },
  ClaimMissionAlertRewards: {
    profileId: 'campaign',
    payload: [
      { name: 'missionAlertId', type: 'string', required: true, description: 'Mission Alert GUID' },
      { name: 'zoneId', type: 'string', required: true, description: 'Zone (Outpost) GUID' },
    ],
  },
  ClaimQuestReward: {
    profileId: 'campaign',
    payload: [
      { name: 'questId', type: 'string', required: true, description: 'Quest Item GUID' },
      { name: 'selectedRewardIndex', type: 'number', required: false, description: 'Index of the reward to select (if multiple)' },
    ],
    notes: 'profileId can be campaign or athena',
  },
  ClientQuestLogin: {
    profileId: 'athena',
    payload: [
      { name: 'streamingAppKey', type: 'string', required: false, description: 'Can be left empty. Used for GeForceNow or XboxCloud.' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  CollectExpedition: {
    profileId: 'campaign',
    payload: [
      { name: 'expeditionTemplate', type: 'string', required: true, description: 'Expedition Template Id, e.g. Expedition:expedition_sea_supplyrun_long_t04' },
      { name: 'expeditionId', type: 'string', required: true, description: 'Expedition Item GUID' },
    ],
  },
  ConsumeItems: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID to consume' },
      { name: 'quantity', type: 'number', required: true, description: 'Amount to consume' },
    ],
  },
  ConvertItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'conversionIndex', type: 'number', required: true, description: 'Index if more than 1 option (e.g. Obsidian vs Shadowshard)' },
    ],
  },
  ConvertSlottedItem: {
    profileId: 'collection_book_people0',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'ConversionIndex', type: 'number', required: true, description: 'Index if more than 1 option (e.g. Obsidian vs Shadowshard)' },
    ],
    notes: 'profileId can be collection_book_people0 or collection_book_schematics0',
  },
  CraftWorldItem: {
    profileId: 'theater0',
    payload: [
      { name: 'targetSchematicItemId', type: 'string', required: true, description: 'Schematic Item GUID' },
      { name: 'numTimesToCraft', type: 'number', required: true, description: 'Quantity of the item to craft' },
      { name: 'targetSchematicTier', type: 'string', required: true, description: 'Item tier as lowercased Roman numeral, e.g. ii' },
    ],
  },
  CreateDeployableBaseItem: {
    profileId: 'outpost0',
    payload: [],
    notes: 'No documented schema',
  },
  CreateOrUpgradeOutpostItem: {
    profileId: 'outpost0',
    payload: [],
    notes: 'No documented schema',
  },
  DestroyWorldItems: {
    profileId: 'outpost0',
    payload: [
      { name: 'itemIds', type: 'array', required: true, description: 'Item GUIDs to destroy (no resources returned)' },
    ],
    notes: 'profileId can be outpost0, theater0, theater1, or theater2',
  },
  EarnScore: {
    profileId: 'campaign',
    payload: [],
    notes: 'No documented schema',
  },
  EndBattleRoyaleGame: {
    profileId: 'athena',
    payload: [
      { name: 'advance', type: 'array', required: false, description: 'Array of {statName, count, timestampOffset}' },
      { name: 'playlistId', type: 'string', required: false, description: 'Playlist identifier' },
      { name: 'matchStats', type: 'object', required: false, description: 'Match stats object' },
      { name: 'totalXPAccum', type: 'number', required: false, description: 'Total XP accumulated' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  EndPrimaryMission: {
    profileId: 'campaign',
    payload: [],
    notes: 'No documented schema',
  },
  EquipBattleRoyaleCustomization: {
    profileId: 'athena',
    payload: [
      { name: 'slotName', type: 'string', required: true, description: 'Slot name, e.g. Character, Backpack, Dance, SkyDiveContrail, LoadingScreen, MusicPack' },
      { name: 'itemToSlot', type: 'string', required: true, description: 'Item Template Id to equip, e.g. AthenaCharacter:CID_001_Athena_Commando_F_Default' },
      { name: 'indexWithinSlot', type: 'number', required: false, description: '0 normally; for Dance: 0-5; for ItemWrap: 0-6' },
      { name: 'variantUpdates', type: 'array', required: false, description: 'Array of {channel, active, owned} variant objects' },
    ],
  },
  EquipCharCosmetic: {
    profileId: 'campaign',
    payload: [
      { name: 'heroId', type: 'string', required: true, description: 'Hero Item GUID' },
      { name: 'outfitId', type: 'string', required: true, description: 'Outfit Item GUID' },
      { name: 'backpackId', type: 'string', required: false, description: 'Back Bling Item GUID' },
    ],
  },
  FortRerollDailyQuest: {
    profileId: 'athena',
    payload: [
      { name: 'questId', type: 'string', required: true, description: 'Quest Item GUID' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  GetMcpTimeForLogin: {
    profileId: 'common_core',
    payload: [],
    notes: 'No documented schema',
  },
  GiftCatalogEntry: {
    profileId: 'common_core',
    payload: [
      { name: 'offerId', type: 'string', required: true, description: 'Offer Id from the catalog' },
      { name: 'currency', type: 'string', required: true, description: 'Currency type from offer' },
      { name: 'currencySubType', type: 'string', required: true, description: 'Currency sub-type from offer' },
      { name: 'expectedTotalPrice', type: 'number', required: true, description: 'Expected total price' },
      { name: 'receiverAccountIds', type: 'array', required: true, description: "Friends' Account Ids" },
      { name: 'giftWrapTemplateId', type: 'string', required: false, description: 'Empty string or GiftBox:GB_GiftWrap1 through 4' },
      { name: 'personalMessage', type: 'string', required: false, description: 'Personal message' },
    ],
  },
  IncrementNamedCounterStat: {
    profileId: 'campaign',
    payload: [
      { name: 'statName', type: 'string', required: true, description: 'Stat name to increment' },
      { name: 'increment', type: 'number', required: true, description: 'Amount to increment by' },
    ],
  },
  IssueFriendCode: {
    profileId: 'common_core',
    payload: [
      { name: 'codeTokenType', type: 'string', required: true, description: 'Type of token to issue' },
    ],
  },
  MarkItemSeen: {
    profileId: 'athena',
    payload: [
      { name: 'itemIds', type: 'array', required: true, description: 'Item GUIDs to mark as seen' },
    ],
    notes: 'profileId can be athena, campaign, or common_core',
  },
  ModifyMission: {
    profileId: 'campaign',
    payload: [
      { name: 'matchmakingSessionId', type: 'string', required: true, description: 'Matchmaking session ID' },
      { name: 'difficulty', type: 'string', required: true, description: 'New difficulty level' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  OpenCardPack: {
    profileId: 'campaign',
    payload: [
      { name: 'cardPackItemId', type: 'string', required: true, description: 'CardPack Item GUID' },
      { name: 'selectionIdx', type: 'number', required: false, description: 'Index of selected reward when multiple rewards exist' },
    ],
  },
  OpenCardPackBatch: {
    profileId: 'campaign',
    payload: [
      { name: 'cardPackItemIds', type: 'array', required: true, description: 'CardPack Item GUIDs' },
    ],
  },
  PopulatePrerolledOffers: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. Prerolls XRAY Llamas.',
  },
  PromoteItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID to supercharge' },
    ],
    notes: 'profileId can be campaign, collection_book_people0, or collection_book_schematics0',
  },
  PurchaseCatalogEntry: {
    profileId: 'common_core',
    payload: [
      { name: 'offerId', type: 'string', required: true, description: 'Offer Id from catalog' },
      { name: 'purchaseQuantity', type: 'number', required: true, description: 'How many times to purchase the offer' },
      { name: 'currency', type: 'string', required: true, description: 'Currency type from offer' },
      { name: 'currencySubType', type: 'string', required: true, description: 'Currency sub-type from offer' },
      { name: 'expectedTotalPrice', type: 'number', required: true, description: 'Expected total price' },
      { name: 'gameContext', type: 'string', required: false, description: 'Game context, e.g. Frontend.CatabaScreen' },
    ],
  },
  PurchaseHomebaseNode: {
    profileId: 'campaign',
    payload: [
      { name: 'nodeId', type: 'string', required: true, description: 'Node Template Id, e.g. HomebaseNode:skilltree_airstrike' },
    ],
  },
  PurchaseOrUpgradeHomebaseNode: {
    profileId: 'campaign',
    payload: [
      { name: 'nodeId', type: 'string', required: true, description: 'Node Template Id, e.g. HomebaseNode:skilltree_airstrike' },
    ],
  },
  PurchaseResearchStatUpgrade: {
    profileId: 'campaign',
    payload: [
      { name: 'statId', type: 'string', required: true, description: 'Valid values: fortitude, offense, resistance, technology' },
    ],
  },
  QueryProfile: {
    profileId: 'athena',
    payload: [],
    notes: 'No payload required. Downloads the full profile. profileId can be any profile.',
  },
  QueryPublicProfile: {
    profileId: 'common_public',
    payload: [],
    notes: 'No payload required. Downloads the public profile.',
  },
  RecycleItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
    ],
  },
  RecycleItemBatch: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemIds', type: 'array', required: true, description: 'Item GUIDs' },
    ],
  },
  RedeemSTWAccoladeTokens: {
    profileId: 'athena',
    payload: [],
    notes: 'No payload required. Transfers BR XP gained in StW to BR.',
  },
  RefreshExpeditions: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. Generates expeditions.',
  },
  RefundMtxPurchase: {
    profileId: 'common_core',
    payload: [
      { name: 'purchaseId', type: 'string', required: true, description: 'Purchase ID from Purchase History profile stat' },
      { name: 'quickReturn', type: 'boolean', required: true, description: 'Whether to use the Cancel Purchase feature' },
      { name: 'gameContext', type: 'string', required: false, description: 'Game context, e.g. Frontend.AthenaLobby or empty string' },
    ],
  },
  RemoveGiftBox: {
    profileId: 'athena',
    payload: [
      { name: 'giftBoxItemIds', type: 'array', required: true, description: 'Giftbox Item GUIDs to remove' },
    ],
    notes: 'profileId can be any profile',
  },
  RespecAlteration: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'alterationSlot', type: 'number', required: true, description: 'Perk Index' },
      { name: 'alterationId', type: 'string', required: true, description: 'Perk Template Id, e.g. Alteration:aid_att_damage_t05' },
    ],
  },
  RespecResearch: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. Resets StW Research Levels.',
  },
  RespecUpgrades: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. Resets StW Upgrade Levels.',
  },
  SetActiveHeroLoadout: {
    profileId: 'campaign',
    payload: [
      { name: 'selectedLoadout', type: 'string', required: true, description: 'Loadout Item GUID' },
    ],
  },
  SetAffiliateName: {
    profileId: 'common_core',
    payload: [
      { name: 'affiliateName', type: 'string', required: true, description: 'Support-A-Creator code to support' },
    ],
  },
  SetBattleRoyaleBanner: {
    profileId: 'athena',
    payload: [
      { name: 'homebaseBannerIconId', type: 'string', required: true, description: 'Banner icon asset name, e.g. standardbanner1' },
      { name: 'homebaseBannerColorId', type: 'string', required: true, description: 'Banner color asset name, e.g. defaultcolor2' },
    ],
  },
  SetCosmeticLockerSlot: {
    profileId: 'athena',
    payload: [
      { name: 'lockerItem', type: 'string', required: true, description: 'Locker Item GUID' },
      { name: 'category', type: 'string', required: true, description: 'Category, e.g. Character, Backpack, Dance, ItemWrap, SkyDiveContrail' },
      { name: 'itemToSlot', type: 'string', required: true, description: 'Cosmetic to equip, e.g. AthenaCharacter:CID_029_Athena_Commando_F_Halloween' },
      { name: 'slotIndex', type: 'number', required: true, description: '0 normally, -1 for all wrap slots, 0-5 for emotes, 0-6 for wraps' },
      { name: 'variantUpdates', type: 'array', required: false, description: 'Array of {channel, active, owned} variant update objects' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  SetGameplayStats: {
    profileId: 'campaign',
    payload: [
      { name: 'gameplayStats', type: 'array', required: true, description: 'Array of {statName: string, statValue: number}' },
    ],
  },
  SetHomebaseBanner: {
    profileId: 'common_public',
    payload: [
      { name: 'homebaseBannerIconId', type: 'string', required: true, description: 'Banner icon asset name, e.g. standardbanner1' },
      { name: 'homebaseBannerColorId', type: 'string', required: true, description: 'Banner color asset name, e.g. defaultcolor2' },
    ],
  },
  SetHomebaseName: {
    profileId: 'common_public',
    payload: [
      { name: 'homebaseName', type: 'string', required: true, description: 'New homebase name' },
    ],
    notes: 'Deprecated',
  },
  SetItemArchivedStatusBatch: {
    profileId: 'athena',
    payload: [
      { name: 'itemIds', type: 'array', required: true, description: 'Array of Item GUIDs' },
      { name: 'archived', type: 'boolean', required: true, description: 'Whether the items should be archived' },
    ],
  },
  SetItemFavoriteStatus: {
    profileId: 'athena',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'GUID of the item' },
      { name: 'bFavorite', type: 'boolean', required: true, description: 'Whether the item should be favorited' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  SetItemFavoriteStatusBatch: {
    profileId: 'athena',
    payload: [
      { name: 'itemIds', type: 'array', required: true, description: 'Array of Item GUIDs' },
      { name: 'itemFavStatus', type: 'array', required: true, description: 'Array of booleans specifying new favorite state for each indexed item' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  SetLoadoutName: {
    profileId: 'athena',
    payload: [
      { name: 'lockerItem', type: 'string', required: true, description: 'Locker Item GUID' },
      { name: 'name', type: 'string', required: true, description: 'New loadout name' },
    ],
  },
  SetMtxPlatform: {
    profileId: 'common_core',
    payload: [
      { name: 'newPlatform', type: 'string', required: true, description: 'Platform: WeGame|EpicPCKorea|Epic|EpicPC|EpicAndroid|PSN|Live|IOSAppStore|Nintendo|Samsung|GooglePlay|Shared' },
    ],
  },
  SetPinnedQuests: {
    profileId: 'campaign',
    payload: [
      { name: 'pinnedQuestIds', type: 'array', required: true, description: 'Array of quest GUIDs to pin' },
    ],
  },
  SetReceiveGiftsEnabled: {
    profileId: 'common_core',
    payload: [
      { name: 'bReceiveGifts', type: 'boolean', required: true, description: 'true to enable receiving gifts, false to disable' },
    ],
  },
  SkipTutorial: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. Skips the Save the World tutorial.',
  },
  StartExpedition: {
    profileId: 'campaign',
    payload: [
      { name: 'expeditionId', type: 'string', required: true, description: 'Expedition GUID' },
      { name: 'squadId', type: 'string', required: true, description: 'Squad Id' },
      { name: 'itemIds', type: 'array', required: true, description: 'Array of hero GUIDs to use' },
      { name: 'slotIndices', type: 'array', required: true, description: 'Slot indices' },
    ],
  },
  StorageTransfer: {
    profileId: 'theater0',
    payload: [
      { name: 'transferOperations', type: 'array', required: true, description: 'Array of {itemId: string, quantity: number, toStorage: boolean, newItemIdHint: string}' },
    ],
  },
  TransmogItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID to transmogrify' },
    ],
  },
  UnassignAllSquads: {
    profileId: 'campaign',
    payload: [
      { name: 'squadIds', type: 'array', required: true, description: 'Array of squad Ids, e.g. Squad_Attribute_Medicine_EMTSquad' },
    ],
  },
  UnloadWarehouse: {
    profileId: 'campaign',
    payload: [],
    notes: 'No documented schema',
  },
  UnslotAllWorkers: {
    profileId: 'campaign',
    payload: [],
    notes: 'No documented schema',
  },
  UnslotItemFromCollectionBook: {
    profileId: 'campaign',
    payload: [
      { name: 'templateId', type: 'string', required: true, description: 'Item Template Id' },
      { name: 'itemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'specific', type: 'string', required: false, description: 'Leave as empty string' },
    ],
    notes: 'profileId can be campaign, theater0, theater1, or theater2',
  },
  UpdateBuildingLevelAndRating: {
    profileId: 'outpost0',
    payload: [],
    notes: 'No documented schema',
  },
  UpdateDeployableBaseTierProgression: {
    profileId: 'outpost0',
    payload: [],
    notes: 'No documented schema',
  },
  UpdateOutpostCore: {
    profileId: 'outpost0',
    payload: [],
    notes: 'No documented schema',
  },
  UpdateQuestClientObjectives: {
    profileId: 'campaign',
    payload: [
      { name: 'advance', type: 'array', required: true, description: 'Array of {statName: string, count: number, timestampOffset: number (use 0)}' },
    ],
    notes: 'profileId can be campaign or athena',
  },
  UpgradeAlteration: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'alterationSlot', type: 'number', required: true, description: 'Index of the Alteration Slot (0-5)' },
    ],
  },
  UpgradeItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID to upgrade by +1 level' },
    ],
  },
  UpgradeItemBulk: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'desiredLevel', type: 'number', required: true, description: 'Target level to upgrade to' },
      { name: 'desiredTier', type: 'string', required: true, description: 'Tier: no_tier or lowercased Roman numerals' },
      { name: 'conversionRecipeIndexChoice', type: 'number', required: false, description: 'Recipe index when multiple options exist, -1 for default' },
    ],
  },
  UpgradeItemRarity: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID of the hero or schematic to upgrade rarity' },
    ],
  },
  UpgradeSlottedItem: {
    profileId: 'collection_book_people0',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'desiredLevel', type: 'number', required: true, description: 'Desired level to upgrade to' },
    ],
    notes: 'profileId can be collection_book_people0 or collection_book_schematics0',
  },
};

const PROFILES = [
  'athena', 'common_core', 'campaign', 'theater0', 'theater1', 'theater2',
  'outpost0', 'collections', 'collection_book_people0',
  'collection_book_schematics0', 'metadata', 'common_public', 'creative',
  'recycle_bin', 'proto_juno',
];

// ─── Payload validation ────────────────────────────────────────

interface ValidationResult {
  payload: Record<string, unknown>;
  errors: { field: string; message: string }[];
  missingRequired: FieldDef[];
}

interface ValidationMessages {
  payloadMustBeObject: string;
  invalidJson: string;
  mustBeNumber: string;
  mustBeBoolean: string;
  mustBeArray: string;
  mustBeObject: string;
}

function formatFieldMsg(template: string, field: string): string {
  return template.replace('{field}', field);
}

function validatePayload(schema: OpSchema, rawJson: string | null, msgs: ValidationMessages): ValidationResult {
  const errors: { field: string; message: string }[] = [];
  const payload: Record<string, unknown> = {};

  if (schema.payload.length === 0) {
    return { payload, errors, missingRequired: [] };
  }

  let parsed: Record<string, unknown> = {};
  if (rawJson) {
    try {
      const val = JSON.parse(rawJson);
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        parsed = val as Record<string, unknown>;
      } else {
        errors.push({ field: 'payload', message: msgs.payloadMustBeObject });
        return { payload, errors, missingRequired: [] };
      }
    } catch {
      errors.push({ field: 'payload', message: msgs.invalidJson });
      return { payload, errors, missingRequired: [] };
    }
  }

  const missingRequired: FieldDef[] = [];

  for (const field of schema.payload) {
    const raw = parsed[field.name];

    if (raw === undefined || raw === null || raw === '') {
      if (field.required) {
        missingRequired.push(field);
      }
      continue;
    }

    // Type coercion and validation
    if (field.type === 'string') {
      payload[field.name] = String(raw);
    } else if (field.type === 'number') {
      const n = Number(raw);
      if (isNaN(n)) {
        errors.push({ field: field.name, message: formatFieldMsg(msgs.mustBeNumber, field.name) });
      } else {
        payload[field.name] = n;
      }
    } else if (field.type === 'boolean') {
      if (raw === true || raw === false || raw === 'true' || raw === 'false') {
        payload[field.name] = raw === true || raw === 'true';
      } else {
        errors.push({ field: field.name, message: formatFieldMsg(msgs.mustBeBoolean, field.name) });
      }
    } else if (field.type === 'array') {
      if (!Array.isArray(raw)) {
        errors.push({ field: field.name, message: formatFieldMsg(msgs.mustBeArray, field.name) });
      } else {
        payload[field.name] = raw;
      }
    } else if (field.type === 'object') {
      if (typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push({ field: field.name, message: formatFieldMsg(msgs.mustBeObject, field.name) });
      } else {
        payload[field.name] = raw;
      }
    }
  }

  return { payload, errors, missingRequired };
}

// ─── Schema description builder ───────────────────────────────

interface SchemaLabels {
  requiredFields: string;
  optionalFields: string;
  defaultProfile: string;
}

const DEFAULT_SCHEMA_LABELS: SchemaLabels = {
  requiredFields: '**Required fields:**',
  optionalFields: '**Optional fields:**',
  defaultProfile: '**Default profile:** `{profile}`',
};

function buildSchemaDescription(schema: OpSchema, operacion: string, labels: SchemaLabels, noPayloadRequired: string): string {
  const required = schema.payload.filter((f) => f.required);
  const optional = schema.payload.filter((f) => !f.required);

  if (schema.payload.length === 0) {
    return `> ${noPayloadRequired.replace('{operation}', operacion)}${schema.notes ? `\n> ${schema.notes}` : ''}`;
  }

  let desc = '';

  if (required.length > 0) {
    desc += `${labels.requiredFields}\n`;
    desc += required.map((f) => `• \`${f.name}\` *(${f.type})* — ${f.description}`).join('\n');
  }

  if (optional.length > 0) {
    if (desc) desc += '\n\n';
    desc += `${labels.optionalFields}\n`;
    desc += optional.map((f) => `• \`${f.name}\` *(${f.type})* — ${f.description}`).join('\n');
  }

  if (schema.notes) {
    desc += `\n\n> 📝 ${schema.notes}`;
  }

  desc += `\n\n${labels.defaultProfile.replace('{profile}', schema.profileId.split('|')[0])}`;

  return desc;
}

// ─── Command ──────────────────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('composemcp')
    .setDescription('Execute a custom MCP operation on your main account.')
    .setNameLocalizations(buildDiscordLocalizations('composemcp.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('composemcp.cmd.description'))
    .addStringOption((option) =>
      option
        .setName('operation')
        .setDescription('MCP operation to execute')
        .setNameLocalizations(buildDiscordLocalizations('composemcp.cmd.options.operation.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('composemcp.cmd.options.operation.description'))
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('profile')
        .setDescription('Profile ID to run the operation on')
        .setNameLocalizations(buildDiscordLocalizations('composemcp.cmd.options.profile.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('composemcp.cmd.options.profile.description'))
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('payload')
        .setDescription('JSON payload (optional — required fields can be filled interactively)')
        .setNameLocalizations(buildDiscordLocalizations('composemcp.cmd.options.payload.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('composemcp.cmd.options.payload.description'))
        .setRequired(false),
    ) as unknown as SlashCommandBuilder,

  auth: true,
  nodefer: true,
  prem: true,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const [noPayloadLabel, reqCountTpl] = await Promise.all([
      translateForUser(userId, 'composemcp.autocomplete.noPayload', undefined, locale),
      translateForUser(userId, 'composemcp.autocomplete.requiredCount', undefined, locale),
    ]);

    const focused = interaction.options.getFocused(true);
    const query = focused.value.toLowerCase();

    if (focused.name === 'operation') {
      const ops = Object.keys(OPERATIONS_SCHEMA).sort();
      const filtered = query ? ops.filter((o) => o.toLowerCase().includes(query)) : ops;
      await interaction.respond(
        filtered.slice(0, 25).map((op) => {
          const schema = OPERATIONS_SCHEMA[op];
          const reqCount = schema.payload.filter((f) => f.required).length;
          const suffix = schema.payload.length === 0
            ? ` ${noPayloadLabel}`
            : ` ${reqCountTpl.replace('{count}', String(reqCount))}`;
          return { name: `${op}${suffix}`, value: op };
        }),
      );
    } else if (focused.name === 'profile') {
      // Check if an operation was already selected and suggest its default profile
      const selectedOp = interaction.options.getString('operation') ?? '';
      const schema = OPERATIONS_SCHEMA[selectedOp];
      const suggestedProfile = schema ? schema.profileId.split('|')[0] : '';

      let profiles = [...PROFILES];
      // Sort suggested profile to top
      if (suggestedProfile && profiles.includes(suggestedProfile)) {
        profiles = [suggestedProfile, ...profiles.filter((p) => p !== suggestedProfile)];
      }

      const filtered = query ? profiles.filter((p) => p.includes(query)) : profiles;
      await interaction.respond(
        filtered.slice(0, 25).map((p) => ({
          name: p,
          value: p,
        }))
      );
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const emojis = new EmojiHelper(interaction.client);
    const client = interaction.client;

    // Defer manually so the initial response has NO embeds, making IsComponentsV2 valid
    await interaction.deferReply();
    const trans = {
      success: {
        title: await translateForUser(userId, 'composemcp.success.title'),
        operation: await translateForUser(userId, 'composemcp.success.operation'),
        profile: await translateForUser(userId, 'composemcp.success.profile'),
        payloadSent: await translateForUser(userId, 'composemcp.success.payloadSent'),
        noPayload: await translateForUser(userId, 'composemcp.success.noPayload'),
        footer: await translateForUser(userId, 'composemcp.success.footer'),
      },
      info: {
        title: await translateForUser(userId, 'composemcp.info.title'),
        requiredFields: await translateForUser(userId, 'composemcp.info.requiredFields'),
        optionalFields: await translateForUser(userId, 'composemcp.info.optionalFields'),
        defaultProfile: await translateForUser(userId, 'composemcp.info.defaultProfile'),
        howToUse: await translateForUser(userId, 'composemcp.info.howToUse'),
        footer: await translateForUser(userId, 'composemcp.info.footer'),
      },
      schema: {
        noPayloadRequired: await translateForUser(userId, 'composemcp.schema.noPayloadRequired'),
      },
      validation: {
        payloadMustBeObject: await translateForUser(userId, 'composemcp.validation.payloadMustBeObject'),
        invalidJson: await translateForUser(userId, 'composemcp.validation.invalidJson'),
        mustBeNumber: await translateForUser(userId, 'composemcp.validation.mustBeNumber'),
        mustBeBoolean: await translateForUser(userId, 'composemcp.validation.mustBeBoolean'),
        mustBeArray: await translateForUser(userId, 'composemcp.validation.mustBeArray'),
        mustBeObject: await translateForUser(userId, 'composemcp.validation.mustBeObject'),
      },
      panel: {
        executing: await translateForUser(userId, 'composemcp.panel.executing'),
        pleaseWait: await translateForUser(userId, 'composemcp.panel.pleaseWait'),
        allFieldsFilled: await translateForUser(userId, 'composemcp.panel.allFieldsFilled'),
        profileChangeHint: await translateForUser(userId, 'composemcp.panel.profileChangeHint'),
        headerRemaining: await translateForUser(userId, 'composemcp.panel.headerRemaining'),
        profileRemaining: await translateForUser(userId, 'composemcp.panel.profileRemaining'),
        fieldSingular: await translateForUser(userId, 'composemcp.panel.fieldSingular'),
        fieldPlural: await translateForUser(userId, 'composemcp.panel.fieldPlural'),
        change: await translateForUser(userId, 'composemcp.panel.change'),
        setField: await translateForUser(userId, 'composemcp.panel.setField'),
        cancel: await translateForUser(userId, 'composemcp.panel.cancel'),
        cancelled: await translateForUser(userId, 'composemcp.panel.cancelled'),
        cancelledDetail: await translateForUser(userId, 'composemcp.panel.cancelledDetail'),
        modalTitle: await translateForUser(userId, 'composemcp.panel.modalTitle'),
        placeholders: {
          number: await translateForUser(userId, 'composemcp.panel.placeholders.number'),
          boolean: await translateForUser(userId, 'composemcp.panel.placeholders.boolean'),
          array: await translateForUser(userId, 'composemcp.panel.placeholders.array'),
          object: await translateForUser(userId, 'composemcp.panel.placeholders.object'),
        },
      },
      errors: {
        unknownTitle: await translateForUser(userId, 'composemcp.errors.unknownOperation.title'),
        unknownDesc: await translateForUser(userId, 'composemcp.errors.unknownOperation.description'),
        didYouMean: await translateForUser(userId, 'composemcp.errors.unknownOperation.didYouMean'),
        missingTitle: await translateForUser(userId, 'composemcp.errors.missingFields.title'),
        missingDesc: await translateForUser(userId, 'composemcp.errors.missingFields.description'),
        yourPayload: await translateForUser(userId, 'composemcp.errors.missingFields.yourPayload'),
        fullSchema: await translateForUser(userId, 'composemcp.errors.missingFields.fullSchema'),
        typeTitle: await translateForUser(userId, 'composemcp.errors.typeError.title'),
        typeDesc: await translateForUser(userId, 'composemcp.errors.typeError.description'),
        apiTitle: await translateForUser(userId, 'composemcp.errors.apiError.title'),
        unknownError: await translateForUser(userId, 'composemcp.errors.apiError.unknownError'),
        codeLabel: await translateForUser(userId, 'composemcp.errors.apiError.codeLabel'),
      },
    };

    // ── Account ───────────────────────────────────────────────
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user || !user.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const authorData = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    const operacion = interaction.options.getString('operation', true);
    const profileId = interaction.options.getString('profile', true);
    const rawPayload = interaction.options.getString('payload', false);

    const schema = OPERATIONS_SCHEMA[operacion];

    // ── Unknown operation ─────────────────────────────────────
    if (!schema) {
      const knownOps = Object.keys(OPERATIONS_SCHEMA).sort();
      const close = knownOps.filter((o) => o.toLowerCase().includes(operacion.toLowerCase())).slice(0, 5);
      const [title, description, didYouMean] = await Promise.all([
        translateEpic(client, userId, 'composemcp.errors.unknownOperation.title', 'error', undefined, interaction.locale),
        translateForUser(userId, 'composemcp.errors.unknownOperation.description', { operation: operacion }, interaction.locale),
        translateForUser(userId, 'composemcp.errors.unknownOperation.didYouMean', undefined, interaction.locale),
      ]);

      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        title,
        description:
          description +
          (close.length > 0 ? `\n\n${didYouMean}\n${close.map((o) => `• \`${o}\``).join('\n')}` : ''),
        author: authorData,
        footerKey: 'brand',
      });
      return;
    }

    const requiredFields = schema.payload.filter((f) => f.required);

    // ── Shared MCP executor ───────────────────────────────────
    // Builds and sends the final success/error message (Components V2)
    const doRunMcp = async (finalPayload: Record<string, unknown>) => {
      const endpoint = `${Endpoints.MCP}/${mainAccount.accountId}/client/${operacion}?profileId=${profileId}&rvn=-1`;
      const attachmentName = `mcp_${operacion}_${profileId}.json`;

      let responseData: unknown;
      try {
        const res = await axios.post(endpoint, finalPayload, {
          headers: {
            Authorization: `Bearer ${mainAccount.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        });
        responseData = res.data;
      } catch (err: any) {
        const apiError = err?.response?.data;
        const errorMsg = apiError?.errorMessage ?? apiError?.message ?? err?.message ?? trans.errors.unknownError;
        const errorCode = apiError?.errorCode ?? err?.response?.status ?? '';
        const codeLine = errorCode
          ? trans.errors.codeLabel.replace('{code}', String(errorCode))
          : '';

        const payloadPreview =
          Object.keys(finalPayload).length > 0
            ? `\`\`\`json\n${JSON.stringify(finalPayload, null, 2).slice(0, 300)}\n\`\`\``
            : trans.success.noPayload;

        await replyWithEpicEmbed(interaction, userId, {
          style: 'error',
          title: trans.errors.apiTitle,
          description: [
            `\`\`\`\n${errorMsg}${codeLine ? `\n${codeLine}` : ''}\n\`\`\``,
            '',
            trans.success.payloadSent,
            payloadPreview,
          ].join('\n'),
          author: authorData,
          footerKey: 'brand',
        });
        return;
      }

      // ── Success ───────────────────────────────────────────
      const jsonStr = JSON.stringify(responseData, null, 2);
      const buffer = Buffer.from(jsonStr);
      const fileSizeKB = (buffer.byteLength / 1024).toFixed(1);
      const payloadJson = JSON.stringify(finalPayload, null, 2);
      const payloadPreview =
        Object.keys(finalPayload).length > 0
          ? `\`\`\`json\n${payloadJson.slice(0, 400)}${payloadJson.length > 400 ? '\n...' : ''}\n\`\`\``
          : trans.success.noPayload;

      const attachment = new AttachmentBuilder(buffer, { name: attachmentName });
      const successPayload = await buildEpicReplyPayload(
        userId,
        {
          style: 'success',
          title: trans.success.title,
          description: [
            trans.success.operation.replace('{operation}', operacion),
            trans.success.profile.replace('{profile}', profileId),
            '',
            trans.success.payloadSent,
            payloadPreview,
          ].join('\n'),
          author: authorData,
          footerText: trans.success.footer.replace('{size}', fileSizeKB),
          footerKey: 'none',
        },
        interaction,
        interaction.locale,
        [attachment],
      );

      await interaction.editReply({
        embeds: successPayload.embeds,
        files: successPayload.files,
        components: [],
      });
    };

    // ── Interactive payload builder (no payload + has required fields) ────────
    if (!rawPayload && requiredFields.length > 0) {
      const filled = new Map<string, string>();

      const buildPayloadContainer = (executing = false) => {
        const filledCount = requiredFields.filter((f) => filled.has(f.name)).length;
        const totalRequired = requiredFields.length;
        const allFilled = filledCount === totalRequired;

        const accentColor = executing
          ? EMBED_COLORS.info
          : allFilled
          ? EMBED_COLORS.success
          : filledCount > 0
          ? EMBED_COLORS.info
          : EMBED_COLORS.warning;

        const remaining = totalRequired - filledCount;
        const fieldsLabel = remaining === 1 ? trans.panel.fieldSingular : trans.panel.fieldPlural;
        const headerText = executing
          ? `## ${emojis.cargando} ${trans.panel.executing.replace('{operation}', operacion)}\n-# ${trans.panel.pleaseWait}`
          : allFilled
          ? `## ${emojis.success} ${trans.panel.allFieldsFilled.replace('{operation}', operacion)}\n-# ${trans.panel.profileChangeHint.replace('{profileId}', profileId)}`
          : `## ${trans.panel.headerRemaining.replace('{operation}', operacion)}\n-# ${trans.panel.profileRemaining.replace('{profileId}', profileId).replace('{remaining}', String(remaining)).replace('{fieldsLabel}', fieldsLabel)}`;

        const container = new ContainerBuilder().setAccentColor(accentColor);

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(authorData?.iconURL ?? interaction.user.displayAvatarURL())
            )
        );

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

        for (let i = 0; i < requiredFields.length; i++) {
          const field = requiredFields[i];
          const isDone = filled.has(field.name);
          const storedVal = filled.get(field.name);

          const fieldContent = isDone
            ? `**${emojis.check} ${field.name}** *(${field.type})*\n-# \`${storedVal!.length > 80 ? storedVal!.slice(0, 77) + '...' : storedVal}\``
            : `**${field.name}** *(${field.type})*\n-# ${field.description}`;

          const btnLabel = isDone
            ? trans.panel.change
            : trans.panel.setField.replace('{field}', field.name).slice(0, 80);

          const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldContent))
            .setButtonAccessory(
              new ButtonBuilder()
                .setCustomId(`mcp_field_${i}`)
                .setLabel(btnLabel)
                .setStyle(isDone ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(executing)
            );

          container.addSectionComponents(section);
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

        container.addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('mcp_cancel')
              .setLabel(trans.panel.cancel)
              .setStyle(ButtonStyle.Danger)
              .setDisabled(executing)
          )
        );

        return container;
      };

      // Send the initial interactive message
      await interaction.editReply({
        components: [buildPayloadContainer().toJSON() as any],
        flags: MessageFlags.IsComponentsV2,
      } as any);

      const reply = await interaction.fetchReply();
      const collector = reply.createMessageComponentCollector({
        filter: (i) => i.user.id === userId,
        idle: EPIC_PANEL_IDLE_MS,
      });

      collector.on('collect', async (btn) => {
        const cid = btn.customId;

        // Cancel button
        if (cid === 'mcp_cancel') {
          collector.stop('cancelled');
          await (btn.update as any)({
            components: [
              new ContainerBuilder()
                .setAccentColor(EMBED_COLORS.error)
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    `## ${emojis.error} ${trans.panel.cancelled}\n-# ${trans.panel.cancelledDetail.replace('{operation}', operacion)}`,
                  ),
                )
                .toJSON(),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          return;
        }

        if (!cid.startsWith('mcp_field_')) return;

        const idx = parseInt(cid.replace('mcp_field_', ''), 10);
        const field = requiredFields[idx];
        if (!field) return;

        // Build and show modal for this field
        const inputStyle =
          field.type === 'object' || field.type === 'array'
            ? TextInputStyle.Paragraph
            : TextInputStyle.Short;

        const placeholder =
          field.type === 'number'
            ? trans.panel.placeholders.number
            : field.type === 'boolean'
            ? trans.panel.placeholders.boolean
            : field.type === 'array'
            ? trans.panel.placeholders.array
            : field.type === 'object'
            ? trans.panel.placeholders.object
            : field.description.slice(0, 100);

        const maxLength =
          field.type === 'number' || field.type === 'boolean'
            ? 20
            : field.type === 'string'
            ? 1000
            : 2000;

        const labelText = `${field.name} (${field.type})`.slice(0, 45);

        const textInput = new TextInputBuilder()
          .setCustomId('field_value')
          .setLabel(labelText)
          .setStyle(inputStyle)
          .setPlaceholder(placeholder)
          .setRequired(true)
          .setMaxLength(maxLength);

        const existingValue = filled.get(field.name);
        if (existingValue) textInput.setValue(existingValue);

        const modalId = `mcp_modal_${idx}_${userId}`;
        const modal = new ModalBuilder()
          .setCustomId(modalId)
          .setTitle(trans.panel.modalTitle.replace('{field}', field.name).slice(0, 45))
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(textInput));

        await btn.showModal(modal);

        try {
          const modalSubmit = await btn.awaitModalSubmit({
            filter: (m) => m.customId === modalId && m.user.id === userId,
            time: 5 * 60 * 1000,
          });

          const rawValue = modalSubmit.fields.getTextInputValue('field_value').trim();
          filled.set(field.name, rawValue);

          const allFilled = requiredFields.every((f) => filled.has(f.name));
          await modalSubmit.deferUpdate();

          if (allFilled) {
            collector.stop('done');

            // Show "executing" state
            await interaction.editReply({
              components: [buildPayloadContainer(true).toJSON() as any],
              flags: MessageFlags.IsComponentsV2,
            } as any);

            // Coerce string values to correct types
            const builtPayload: Record<string, unknown> = {};
            for (const f of requiredFields) {
              const val = filled.get(f.name)!;
              if (f.type === 'number') {
                builtPayload[f.name] = Number(val);
              } else if (f.type === 'boolean') {
                builtPayload[f.name] = val === 'true';
              } else if (f.type === 'array' || f.type === 'object') {
                try {
                  builtPayload[f.name] = JSON.parse(val);
                } catch {
                  builtPayload[f.name] = val;
                }
              } else {
                builtPayload[f.name] = val;
              }
            }

            await doRunMcp(builtPayload);
          } else {
            // Update to show newly filled field
            await interaction.editReply({
              components: [buildPayloadContainer().toJSON() as any],
              flags: MessageFlags.IsComponentsV2,
            } as any);
          }
        } catch {
          // Modal timed out — the user didn't submit the modal, just ignore
        }
      });

      collector.on('end', async (_, reason) => {
        if (isCollectorIdle(reason)) {
          const inactiveText = await translateForUser(userId, 'epic.inactivePanel', undefined, interaction.locale);
          await editReplyInactive(interaction, inactiveText).catch(() => {});
        }
      });

      return; // Collector handles the rest
    }

    // ── Direct execution path (payload provided or no fields needed) ─────────
    const { payload, errors, missingRequired } = validatePayload(schema, rawPayload ?? null, trans.validation);

    // Missing required fields in the provided JSON payload
    if (missingRequired.length > 0) {
      const missingList = missingRequired
        .map((f) => `• \`${f.name}\` *(${f.type})* — ${f.description}`)
        .join('\n');

      const [title, description, yourPayload, fullSchema] = await Promise.all([
        translateEpic(client, userId, 'composemcp.errors.missingFields.title', 'error', undefined, interaction.locale),
        translateForUser(userId, 'composemcp.errors.missingFields.description', undefined, interaction.locale),
        translateForUser(userId, 'composemcp.errors.missingFields.yourPayload', undefined, interaction.locale),
        translateForUser(userId, 'composemcp.errors.missingFields.fullSchema', undefined, interaction.locale),
      ]);

      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        title,
        description:
          `${description}\n\n${missingList}\n\n` +
          `${yourPayload}\n\`\`\`json\n${rawPayload}\n\`\`\`\n` +
          `${fullSchema}\n${buildSchemaDescription(schema, operacion, trans.info, trans.schema.noPayloadRequired)}`,
        author: authorData,
        footerText: trans.info.footer.replace('{profile}', profileId).replace('{operation}', operacion),
        footerKey: 'none',
      });
      return;
    }

    if (errors.length > 0) {
      const errorList = errors.map((e) => `• ${e.message}`).join('\n');
      const [title, description] = await Promise.all([
        translateEpic(client, userId, 'composemcp.errors.typeError.title', 'error', undefined, interaction.locale),
        translateForUser(userId, 'composemcp.errors.typeError.description', undefined, interaction.locale),
      ]);

      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        title,
        description: `${description}\n\n${errorList}`,
        author: authorData,
        footerText: trans.info.footer.replace('{profile}', profileId).replace('{operation}', operacion),
        footerKey: 'none',
      });
      return;
    }

    await doRunMcp(payload);
  },
};

export default command;

