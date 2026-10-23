/**
 * The threshold fields a Notification Event can carry (issue #299, extended
 * by #750 and the wallet-balance threshold): one spec per stored field — its
 * key, its default, and the control Settings renders for it.
 *
 * Which event owns which field is declared on that event's Event Entry
 * (`eventEntries.ts`'s `thresholds`); this module only says what each field
 * *is*. It is plain data on purpose: `preferences.ts` reads it for defaults
 * and validation, and `preferences.ts` is reachable from the service worker
 * (`sw.ts` → `pushHandler.ts` → … → `preferences.ts`), so importing the Event
 * Entry catalog there would drag every diff and copy renderer into the SW
 * bundle. Nothing here imports anything.
 */

/** One Character's threshold settings. Absent fields read as their default (below). */
export interface CharacterEventThresholds {
  /** Days of fuel remaining that trigger `structureFuelLow` — one of `STRUCTURE_FUEL_LOW_DAY_OPTIONS`. */
  structureFuelLowDays?: number;
  /** Hours before an extractor's `expiry_time` that trigger `planetaryExtractorExpiring` (issue #750) — one of `EXTRACTOR_EXPIRING_LEAD_HOUR_OPTIONS`. */
  extractorExpiringLeadHours?: number;
  /** Hours before the skill queue's tail entry finishes that trigger `skillQueueEnding` (issue #1410) — one of `SKILL_QUEUE_ENDING_LEAD_HOUR_OPTIONS`. */
  skillQueueEndingLeadHours?: number;
  /** Hours before an accepted courier's deliver-by deadline that trigger `courierDeliveryDue` (issue #1713) — one of `COURIER_DELIVERY_DUE_LEAD_HOUR_OPTIONS`. */
  courierDeliveryDueLeadHours?: number;
  /** Hours before an issued, unaccepted contract's `date_expired` that trigger `contractExpiring` (issue #3797) — one of `CONTRACT_EXPIRING_LEAD_HOUR_OPTIONS`. */
  contractExpiringLeadHours?: number;
  /** Hours before the soonest open market order lapses that trigger `ordersLapsing` (issue #3797) — one of `ORDERS_LAPSING_LEAD_HOUR_OPTIONS`. */
  ordersLapsingLeadHours?: number;
  /** ISK balance at or under which `corpWalletThreshold` fires its `balanceBelow` half. */
  corpWalletBalanceFloorIsk?: number;
  /** ISK amount a single journal entry must exceed to fire `corpWalletThreshold`'s `transactionAbove` half. */
  corpWalletTransactionCeilingIsk?: number;
  /** Absolute ISK amount a single wallet journal entry must reach to fire `walletBalanceChanged`. */
  walletBalanceChangedThresholdIsk?: number;
  /** 1 folds a wallet change a contract alert explains into that alert (`engine/walletCause.ts`); 0 keeps both. */
  walletFoldIntoContract?: number;
  /** Jumps from the Current System within which an Incursion fires `incursionNearby` (issue #3542) — one of `INCURSION_NEARBY_JUMP_OPTIONS`. */
  incursionNearbyJumps?: number;
  /** Jumps from the Current System within which a raidable skyhook fires `skyhookRaidableNearby` (issue #4784) — one of `INCURSION_NEARBY_JUMP_OPTIONS`. */
  skyhookRaidableNearbyJumps?: number;
  /** Least zKillboard total value, in ISK, a loss must carry to fire `shipLost` (issue #4772); 0 fires for every loss. */
  shipLostMinimumIsk?: number;
  /** Hours before a Mercenary Den's reinforcement exit that trigger `mercenaryDenReinforced` (issue #4782) — one of `MERCENARY_DEN_REINFORCED_LEAD_HOUR_OPTIONS`. */
  mercenaryDenReinforcedLeadHours?: number;
  /** Anarchy % (within the den's level) at which `mercenaryDenAnarchy` fires (issue #4782) — one of `MERCENARY_DEN_ANARCHY_PERCENT_OPTIONS`. */
  mercenaryDenAnarchyPercent?: number;
  /** Hours before a skyhook's theft window opens that trigger `skyhookRaidable` (issue #4784) — one of `SKYHOOK_RAIDABLE_LEAD_HOUR_OPTIONS`. */
  skyhookRaidableLeadHours?: number;
  /** Least unsecured reagent units that make an open window a danger Alert (issue #4784); 0 makes every open window one. */
  skyhookRaidableMinUnits?: number;
}

export type ThresholdKey = keyof CharacterEventThresholds;

/** The three lead times `structureFuelLow`'s inline control offers (issue #299) — CCP's own alert fires separately and later. */
export const STRUCTURE_FUEL_LOW_DAY_OPTIONS: readonly number[] = [7, 3, 1];

/** The lead times `planetaryExtractorExpiring`'s inline control offers (issue #750), replacing the old fixed 24h/12h pair. */
export const EXTRACTOR_EXPIRING_LEAD_HOUR_OPTIONS: readonly number[] = [24, 12, 6, 1];

/**
 * The lead times `skillQueueEnding`'s inline control offers (issue #1410),
 * all within the 72-hour Projection Horizon (`engine/projection.ts`'s
 * `PROJECTION_HORIZON_MS`) a Scheduled Push can actually reach.
 */
export const SKILL_QUEUE_ENDING_LEAD_HOUR_OPTIONS: readonly number[] = [48, 24, 12, 6];

/** The lead times `courierDeliveryDue`'s inline control offers (issue #1713), all within the 72-hour Projection Horizon. */
export const COURIER_DELIVERY_DUE_LEAD_HOUR_OPTIONS: readonly number[] = [24, 12, 6, 1];

/** The lead times `contractExpiring`'s inline control offers (issue #3797), all within the 72-hour Projection Horizon. */
export const CONTRACT_EXPIRING_LEAD_HOUR_OPTIONS: readonly number[] = [48, 24, 12, 6];

/** The lead times `ordersLapsing`'s inline control offers (issue #3797), all within the 72-hour Projection Horizon. */
export const ORDERS_LAPSING_LEAD_HOUR_OPTIONS: readonly number[] = [48, 24, 12, 6];

/** The lead times `mercenaryDenReinforced`'s inline control offers (issue #4782), all within the 72-hour Projection Horizon. */
export const MERCENARY_DEN_REINFORCED_LEAD_HOUR_OPTIONS: readonly number[] = [24, 12, 6, 1];

/** The anarchy percentages `mercenaryDenAnarchy`'s inline control offers (issue #4782). */
export const MERCENARY_DEN_ANARCHY_PERCENT_OPTIONS: readonly number[] = [25, 50, 75, 90];

/** How near an Incursion must be for `incursionNearby` (issue #3542): a short hop up to a long trip. */
export const INCURSION_NEARBY_JUMP_OPTIONS: readonly number[] = [3, 5, 10, 15, 20];

/** `walletFoldIntoContract`'s two choices: fold (1) or keep both alerts (0). */
export const WALLET_FOLD_INTO_CONTRACT_OPTIONS: readonly number[] = [1, 0];

/** A week's warning is the issue's own justification: "a director planning a fuel run wants a week's warning." */
export const DEFAULT_STRUCTURE_FUEL_LOW_DAYS = 7;
export const DEFAULT_EXTRACTOR_EXPIRING_LEAD_HOURS = 6;
export const DEFAULT_COURIER_DELIVERY_DUE_LEAD_HOURS = 6;
export const DEFAULT_CONTRACT_EXPIRING_LEAD_HOURS = 24;
export const DEFAULT_ORDERS_LAPSING_LEAD_HOURS = 24;
export const DEFAULT_CORP_WALLET_BALANCE_FLOOR_ISK = 50_000_000;
export const DEFAULT_CORP_WALLET_TRANSACTION_CEILING_ISK = 100_000_000;
export const DEFAULT_WALLET_BALANCE_CHANGED_THRESHOLD_ISK = 1_000_000;
export const DEFAULT_WALLET_FOLD_INTO_CONTRACT = 1;
export const DEFAULT_SHIP_LOST_MINIMUM_ISK = 0;
/** The lead times `skyhookRaidable`'s inline control offers (issue #4784), all within the 72-hour Projection Horizon. */
export const SKYHOOK_RAIDABLE_LEAD_HOUR_OPTIONS: readonly number[] = [24, 12, 6, 2, 1];

/** The silo minimums `skyhookRaidable`'s inline control offers; ESI sends no silo capacity, so units, not a percent. */
export const SKYHOOK_RAIDABLE_MIN_UNIT_OPTIONS: readonly number[] = [0, 100, 1000, 10000];

export const DEFAULT_SKYHOOK_RAIDABLE_LEAD_HOURS = 2;
export const DEFAULT_SKYHOOK_RAIDABLE_MIN_UNITS = 0;

export const DEFAULT_MERCENARY_DEN_REINFORCED_LEAD_HOURS = 1;
export const DEFAULT_MERCENARY_DEN_ANARCHY_PERCENT = 50;
/** Close enough to fly to on a whim, without an alert for every Incursion in the region. */
export const DEFAULT_INCURSION_NEARBY_JUMPS = 5;
/** Raid windows are hours long, so the same on-a-whim reach as an Incursion. */
export const DEFAULT_SKYHOOK_RAIDABLE_NEARBY_JUMPS = 5;
/**
 * Matches the roster's own `ENDING_SOON_MS` display constant
 * (`features/skills/queueStatus.ts`) — a pilot's first warning should not
 * arrive later than the "ending soon" flag they already see there. Kept as
 * its own literal rather than importing that constant: this module
 * deliberately imports nothing at runtime (see the file's own doc comment),
 * since it is reachable from the service worker. A test in
 * `eventThresholdFields.test.ts` pins the two together instead.
 */
export const DEFAULT_SKILL_QUEUE_ENDING_LEAD_HOURS = 24;

/**
 * How Settings edits a field:
 *
 * - `choice` — a select over fixed `options`, each option labelled by
 *   `optionKey` with the option as `count`.
 * - `iskAmount` — a free ISK field accepting shorthand ("10.5m"), whose
 *   element id is `${inputIdPrefix}-${characterId}`.
 *
 * `labelKey` is the field's own label (also its accessible name).
 */
export type ThresholdControl =
  | {
      readonly kind: 'choice';
      readonly labelKey: string;
      readonly options: readonly number[];
      readonly optionKey: string;
    }
  | {
      readonly kind: 'iskAmount';
      readonly labelKey: string;
      readonly inputIdPrefix: string;
      /** Keep the label as the accessible name only; the row's heading already says what the field is. */
      readonly labelHidden?: boolean;
    };

export interface ThresholdField<K extends ThresholdKey = ThresholdKey> {
  readonly key: K;
  readonly defaultValue: number;
  readonly control: ThresholdControl;
}

/**
 * Every stored threshold field. Keyed by `ThresholdKey`, so a field added to
 * `CharacterEventThresholds` without a spec here is a type error. Key order
 * is storage order (what `setThresholds` and the synced blob emit).
 */
export const THRESHOLD_FIELDS: { readonly [K in ThresholdKey]: ThresholdField<K> } = {
  structureFuelLowDays: {
    key: 'structureFuelLowDays',
    defaultValue: DEFAULT_STRUCTURE_FUEL_LOW_DAYS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.structureFuelLowThresholdLabel',
      options: STRUCTURE_FUEL_LOW_DAY_OPTIONS,
      optionKey: 'settings.notifications.structureFuelLowThresholdOption',
    },
  },
  extractorExpiringLeadHours: {
    key: 'extractorExpiringLeadHours',
    defaultValue: DEFAULT_EXTRACTOR_EXPIRING_LEAD_HOURS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.extractorExpiringLeadTimeLabel',
      options: EXTRACTOR_EXPIRING_LEAD_HOUR_OPTIONS,
      optionKey: 'settings.notifications.extractorExpiringLeadTimeOption',
    },
  },
  courierDeliveryDueLeadHours: {
    key: 'courierDeliveryDueLeadHours',
    defaultValue: DEFAULT_COURIER_DELIVERY_DUE_LEAD_HOURS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.courierDeliveryDueLeadTimeLabel',
      options: COURIER_DELIVERY_DUE_LEAD_HOUR_OPTIONS,
      optionKey: 'settings.notifications.courierDeliveryDueLeadTimeOption',
    },
  },
  contractExpiringLeadHours: {
    key: 'contractExpiringLeadHours',
    defaultValue: DEFAULT_CONTRACT_EXPIRING_LEAD_HOURS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.contractExpiringLeadTimeLabel',
      options: CONTRACT_EXPIRING_LEAD_HOUR_OPTIONS,
      optionKey: 'settings.notifications.contractExpiringLeadTimeOption',
    },
  },
  ordersLapsingLeadHours: {
    key: 'ordersLapsingLeadHours',
    defaultValue: DEFAULT_ORDERS_LAPSING_LEAD_HOURS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.ordersLapsingLeadTimeLabel',
      options: ORDERS_LAPSING_LEAD_HOUR_OPTIONS,
      optionKey: 'settings.notifications.ordersLapsingLeadTimeOption',
    },
  },
  skillQueueEndingLeadHours: {
    key: 'skillQueueEndingLeadHours',
    defaultValue: DEFAULT_SKILL_QUEUE_ENDING_LEAD_HOURS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.skillQueueEndingLeadTimeLabel',
      options: SKILL_QUEUE_ENDING_LEAD_HOUR_OPTIONS,
      optionKey: 'settings.notifications.skillQueueEndingLeadTimeOption',
    },
  },
  corpWalletBalanceFloorIsk: {
    key: 'corpWalletBalanceFloorIsk',
    defaultValue: DEFAULT_CORP_WALLET_BALANCE_FLOOR_ISK,
    control: {
      kind: 'iskAmount',
      labelKey: 'settings.notifications.corpWalletBalanceFloorLabel',
      inputIdPrefix: 'corp-wallet-floor',
    },
  },
  corpWalletTransactionCeilingIsk: {
    key: 'corpWalletTransactionCeilingIsk',
    defaultValue: DEFAULT_CORP_WALLET_TRANSACTION_CEILING_ISK,
    control: {
      kind: 'iskAmount',
      labelKey: 'settings.notifications.corpWalletTransactionCeilingLabel',
      inputIdPrefix: 'corp-wallet-ceiling',
    },
  },
  walletBalanceChangedThresholdIsk: {
    key: 'walletBalanceChangedThresholdIsk',
    defaultValue: DEFAULT_WALLET_BALANCE_CHANGED_THRESHOLD_ISK,
    control: {
      kind: 'iskAmount',
      labelKey: 'settings.notifications.walletBalanceChangedThresholdLabel',
      inputIdPrefix: 'wallet-balance-changed-threshold',
      labelHidden: true,
    },
  },
  walletFoldIntoContract: {
    key: 'walletFoldIntoContract',
    defaultValue: DEFAULT_WALLET_FOLD_INTO_CONTRACT,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.walletFoldIntoContractLabel',
      options: WALLET_FOLD_INTO_CONTRACT_OPTIONS,
      optionKey: 'settings.notifications.walletFoldIntoContractOption',
    },
  },
  incursionNearbyJumps: {
    key: 'incursionNearbyJumps',
    defaultValue: DEFAULT_INCURSION_NEARBY_JUMPS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.incursionNearbyJumpsLabel',
      options: INCURSION_NEARBY_JUMP_OPTIONS,
      optionKey: 'settings.notifications.incursionNearbyJumpsOption',
    },
  },
  skyhookRaidableNearbyJumps: {
    key: 'skyhookRaidableNearbyJumps',
    defaultValue: DEFAULT_SKYHOOK_RAIDABLE_NEARBY_JUMPS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.skyhookRaidableNearbyJumpsLabel',
      options: INCURSION_NEARBY_JUMP_OPTIONS,
      optionKey: 'settings.notifications.skyhookRaidableNearbyJumpsOption',
    },
  },
  shipLostMinimumIsk: {
    key: 'shipLostMinimumIsk',
    defaultValue: DEFAULT_SHIP_LOST_MINIMUM_ISK,
    control: {
      kind: 'iskAmount',
      labelKey: 'settings.notifications.shipLostMinimumIskLabel',
      inputIdPrefix: 'ship-lost-minimum',
    },
  },
  mercenaryDenReinforcedLeadHours: {
    key: 'mercenaryDenReinforcedLeadHours',
    defaultValue: DEFAULT_MERCENARY_DEN_REINFORCED_LEAD_HOURS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.mercenaryDenReinforcedLeadTimeLabel',
      options: MERCENARY_DEN_REINFORCED_LEAD_HOUR_OPTIONS,
      optionKey: 'settings.notifications.mercenaryDenReinforcedLeadTimeOption',
    },
  },
  mercenaryDenAnarchyPercent: {
    key: 'mercenaryDenAnarchyPercent',
    defaultValue: DEFAULT_MERCENARY_DEN_ANARCHY_PERCENT,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.mercenaryDenAnarchyPercentLabel',
      options: MERCENARY_DEN_ANARCHY_PERCENT_OPTIONS,
      optionKey: 'settings.notifications.mercenaryDenAnarchyPercentOption',
    },
  },
  skyhookRaidableLeadHours: {
    key: 'skyhookRaidableLeadHours',
    defaultValue: DEFAULT_SKYHOOK_RAIDABLE_LEAD_HOURS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.skyhookRaidableLeadTimeLabel',
      options: SKYHOOK_RAIDABLE_LEAD_HOUR_OPTIONS,
      optionKey: 'settings.notifications.skyhookRaidableLeadTimeOption',
    },
  },
  skyhookRaidableMinUnits: {
    key: 'skyhookRaidableMinUnits',
    defaultValue: DEFAULT_SKYHOOK_RAIDABLE_MIN_UNITS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.skyhookRaidableMinUnitsLabel',
      options: SKYHOOK_RAIDABLE_MIN_UNIT_OPTIONS,
      optionKey: 'settings.notifications.skyhookRaidableMinUnitsOption',
    },
  },
};

export const THRESHOLD_KEYS = Object.keys(THRESHOLD_FIELDS) as ThresholdKey[];

/** Every field, absent ones filled with their default. */
export function defaultedThresholds(
  raw: CharacterEventThresholds
): Required<CharacterEventThresholds> {
  const result = {} as Required<CharacterEventThresholds>;
  for (const key of THRESHOLD_KEYS) result[key] = raw[key] ?? THRESHOLD_FIELDS[key].defaultValue;
  return result;
}

function isOptionalFiniteNumber(raw: unknown): boolean {
  return raw === undefined || (typeof raw === 'number' && Number.isFinite(raw));
}

/** A stored per-Character thresholds object: every known field absent or a finite number. */
export function isCharacterEventThresholds(raw: unknown): raw is CharacterEventThresholds {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return THRESHOLD_KEYS.every((key) => isOptionalFiniteNumber(r[key]));
}

/** Only the fields actually set — never an `undefined` value (Firestore rejects those). */
export function setThresholds(raw: CharacterEventThresholds | undefined): CharacterEventThresholds {
  const result: CharacterEventThresholds = {};
  for (const key of THRESHOLD_KEYS) {
    const value = raw?.[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}
