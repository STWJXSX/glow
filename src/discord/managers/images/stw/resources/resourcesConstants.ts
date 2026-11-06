export const RESOURCES_IMAGE_WIDTH = 1120;
export const RESOURCES_OUTPUT_WEBP = { quality: 92, effort: 1, smartSubsample: true } as const;
export const RESOURCES_AMOLED_BG = { r: 0, g: 0, b: 0, alpha: 255 };

/** Schematics above this display power are supercharged (legendary level 50 = 130). */
export const STW_SUPERCHARGED_MIN_POWER = 131;

export const STORM_SHIELD_ZONES = [
  { theater: 1 as const, key: 'stonewood' as const, label: 'Stonewood', max: 10 },
  { theater: 2 as const, key: 'plankerton' as const, label: 'Plankerton', max: 10 },
  { theater: 3 as const, key: 'canny' as const, label: 'Canny Valley', max: 10 },
  { theater: 4 as const, key: 'twine' as const, label: 'Twine Peaks', max: 10 },
];

export const ENDURANCE_QUEST_BY_THEATER: Record<number, string> = {
  1: 'Quest:endurancewave30theater01',
  2: 'Quest:endurancewave30theater02',
  3: 'Quest:endurancewave30theater03',
  4: 'Quest:endurancewave30theater04',
};

/** Long-running STW achievements shown in StormyChecker-style panel. */
export const LONG_CHALLENGES = [
  { id: 'destroygnomes', label: 'Go Gnome!', target: 100 },
  { id: 'playwithothers', label: 'Plays Well with Others', target: 1000 },
  { id: 'buildstructures', label: 'Talented Builder', target: 500 },
  { id: 'savesurvivors', label: 'Guardian Angel', target: 10_000 },
  { id: 'loottreasurechests', label: 'Loot Legend', target: 300 },
  { id: 'explorezones', label: 'World Explorer', target: 1500 },
  { id: 'killmistmonsters', label: 'Unspeakable Horrors', target: 500 },
] as const;

export const FOUNDER_QUEST_TIERS = [
  { quest: 'Quest:foundersquest_getrewards_4_5', label: 'Ultimate Edition' },
  { quest: 'Quest:foundersquest_getrewards_3_4', label: 'Limited Edition' },
  { quest: 'Quest:foundersquest_getrewards_2_3', label: 'Super Deluxe Edition' },
  { quest: 'Quest:foundersquest_getrewards_1_2', label: 'Deluxe Edition' },
  { quest: 'Quest:foundersquest_getrewards_0_1', label: 'Standard Edition' },
] as const;

export const FOUNDER_ENTITLEMENT_HINTS = [
  { match: /ultimate/i, label: 'Ultimate Edition' },
  { match: /limited/i, label: 'Limited Edition' },
  { match: /super.*deluxe|deluxe.*super/i, label: 'Super Deluxe Edition' },
  { match: /deluxe/i, label: 'Deluxe Edition' },
  { match: /standard/i, label: 'Standard Edition' },
  { match: /founder/i, label: 'Founder' },
] as const;
