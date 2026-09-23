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
  /** ISK balance at or under which `corpWalletThreshold` fires its `balanceBelow` half. */
  corpWalletBalanceFloorIsk?: number;
  /** ISK amount a single journal entry must exceed to fire `corpWalletThreshold`'s `transactionAbove` half. */
  corpWalletTransactionCeilingIsk?: number;
  /** Absolute ISK amount a single wallet journal entry must reach to fire `walletBalanceChanged`. */
  walletBalanceChangedThresholdIsk?: number;
}

export type ThresholdKey = keyof CharacterEventThresholds;

/** The three lead times `structureFuelLow`'s inline control offers (issue #299) — CCP's own alert fires separately and later. */
export const STRUCTURE_FUEL_LOW_DAY_OPTIONS: readonly number[] = [7, 3, 1];

/** The lead times `planetaryExtractorExpiring`'s inline control offers (issue #750), replacing the old fixed 24h/12h pair. */
export const EXTRACTOR_EXPIRING_LEAD_HOUR_OPTIONS: readonly number[] = [24, 12, 6, 1];

/** A week's warning is the issue's own justification: "a director planning a fuel run wants a week's warning." */
export const DEFAULT_STRUCTURE_FUEL_LOW_DAYS = 7;
export const DEFAULT_EXTRACTOR_EXPIRING_LEAD_HOURS = 6;
export const DEFAULT_CORP_WALLET_BALANCE_FLOOR_ISK = 50_000_000;
export const DEFAULT_CORP_WALLET_TRANSACTION_CEILING_ISK = 100_000_000;
export const DEFAULT_WALLET_BALANCE_CHANGED_THRESHOLD_ISK = 1_000_000;

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
