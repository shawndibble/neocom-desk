export interface CharacterEventThresholds {
  structureFuelLowDays?: number;
  extractorExpiringLeadHours?: number;
  skillQueueEndingLeadHours?: number;
  courierDeliveryDueLeadHours?: number;
  contractExpiringLeadHours?: number;
  ordersLapsingLeadHours?: number;
  corpWalletBalanceFloorIsk?: number;
  corpWalletTransactionCeilingIsk?: number;
  walletBalanceChangedThresholdIsk?: number;
  walletFoldIntoContract?: number;
  incursionNearbyJumps?: number;
  skyhookRaidableNearbyJumps?: number;
  shipLostMinimumIsk?: number;
  mercenaryDenReinforcedLeadHours?: number;
  mercenaryDenAnarchyPercent?: number;
  acceleratorExpiringLeadHours?: number;
  skyhookRaidableLeadHours?: number;
  skyhookRaidableMinUnits?: number;
  sharedMoonPopLeadMinutes?: number;
}

export type ThresholdKey = keyof CharacterEventThresholds;

export const STRUCTURE_FUEL_LOW_DAY_OPTIONS: readonly number[] = [7, 3, 1];

export const EXTRACTOR_EXPIRING_LEAD_HOUR_OPTIONS: readonly number[] = [24, 12, 6, 1];

export const SKILL_QUEUE_ENDING_LEAD_HOUR_OPTIONS: readonly number[] = [48, 24, 12, 6];

export const COURIER_DELIVERY_DUE_LEAD_HOUR_OPTIONS: readonly number[] = [24, 12, 6, 1];

export const CONTRACT_EXPIRING_LEAD_HOUR_OPTIONS: readonly number[] = [48, 24, 12, 6];

export const ORDERS_LAPSING_LEAD_HOUR_OPTIONS: readonly number[] = [48, 24, 12, 6];

export const ACCELERATOR_EXPIRING_LEAD_HOUR_OPTIONS: readonly number[] = [12, 6, 3, 2, 1];

export const MERCENARY_DEN_REINFORCED_LEAD_HOUR_OPTIONS: readonly number[] = [24, 12, 6, 1];

export const MERCENARY_DEN_ANARCHY_PERCENT_OPTIONS: readonly number[] = [25, 50, 75, 90];

export const INCURSION_NEARBY_JUMP_OPTIONS: readonly number[] = [3, 5, 10, 15, 20];

export const WALLET_FOLD_INTO_CONTRACT_OPTIONS: readonly number[] = [1, 0];

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
export const SKYHOOK_RAIDABLE_LEAD_HOUR_OPTIONS: readonly number[] = [24, 12, 6, 2, 1];

export const SKYHOOK_RAIDABLE_MIN_UNIT_OPTIONS: readonly number[] = [1, 100, 1000, 10000];

export const DEFAULT_SKYHOOK_RAIDABLE_LEAD_HOURS = 2;

export const DEFAULT_SKYHOOK_RAIDABLE_MIN_UNITS = 1;

export const SHARED_MOON_POP_LEAD_MINUTE_OPTIONS: readonly number[] = [0, 15, 30, 60, 120];
export const DEFAULT_SHARED_MOON_POP_LEAD_MINUTES = 0;

export const DEFAULT_MERCENARY_DEN_REINFORCED_LEAD_HOURS = 1;
export const DEFAULT_ACCELERATOR_EXPIRING_LEAD_HOURS = 1;
export const DEFAULT_MERCENARY_DEN_ANARCHY_PERCENT = 50;
export const DEFAULT_INCURSION_NEARBY_JUMPS = 5;
export const DEFAULT_SKYHOOK_RAIDABLE_NEARBY_JUMPS = 5;
export const DEFAULT_SKILL_QUEUE_ENDING_LEAD_HOURS = 24;

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
      readonly labelHidden?: boolean;
    };

export interface ThresholdField<K extends ThresholdKey = ThresholdKey> {
  readonly key: K;
  readonly defaultValue: number;
  readonly control: ThresholdControl;
}

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
  acceleratorExpiringLeadHours: {
    key: 'acceleratorExpiringLeadHours',
    defaultValue: DEFAULT_ACCELERATOR_EXPIRING_LEAD_HOURS,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.acceleratorExpiringLeadTimeLabel',
      options: ACCELERATOR_EXPIRING_LEAD_HOUR_OPTIONS,
      optionKey: 'settings.notifications.acceleratorExpiringLeadTimeOption',
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
  sharedMoonPopLeadMinutes: {
    key: 'sharedMoonPopLeadMinutes',
    defaultValue: DEFAULT_SHARED_MOON_POP_LEAD_MINUTES,
    control: {
      kind: 'choice',
      labelKey: 'settings.notifications.sharedMoonPopLeadTimeLabel',
      options: SHARED_MOON_POP_LEAD_MINUTE_OPTIONS,
      optionKey: 'settings.notifications.sharedMoonPopLeadTimeOption',
    },
  },
};

export const THRESHOLD_KEYS = Object.keys(THRESHOLD_FIELDS) as ThresholdKey[];

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

export function isCharacterEventThresholds(raw: unknown): raw is CharacterEventThresholds {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return THRESHOLD_KEYS.every((key) => isOptionalFiniteNumber(r[key]));
}

export function setThresholds(raw: CharacterEventThresholds | undefined): CharacterEventThresholds {
  const result: CharacterEventThresholds = {};
  for (const key of THRESHOLD_KEYS) {
    const value = raw?.[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}
