import { describe, expect, it } from 'vitest';
import {
  THRESHOLD_FIELDS,
  THRESHOLD_KEYS,
  defaultedThresholds,
  isCharacterEventThresholds,
  setThresholds,
} from './eventThresholds';

describe('THRESHOLD_FIELDS', () => {
  it('lists every stored threshold key, in storage order', () => {
    expect(THRESHOLD_KEYS).toEqual([
      'structureFuelLowDays',
      'extractorExpiringLeadHours',
      'corpWalletBalanceFloorIsk',
      'corpWalletTransactionCeilingIsk',
      'walletBalanceChangedThresholdIsk',
    ]);
  });

  it('keys each field by its own key', () => {
    for (const key of THRESHOLD_KEYS) expect(THRESHOLD_FIELDS[key].key).toBe(key);
  });

  it('offers its default among the choices for a choice control', () => {
    for (const key of THRESHOLD_KEYS) {
      const field = THRESHOLD_FIELDS[key];
      if (field.control.kind === 'choice') {
        expect(field.control.options).toContain(field.defaultValue);
      }
    }
  });
});

describe('defaultedThresholds', () => {
  it('fills every absent field with its default', () => {
    expect(defaultedThresholds({})).toEqual({
      structureFuelLowDays: 7,
      extractorExpiringLeadHours: 6,
      corpWalletBalanceFloorIsk: 50_000_000,
      corpWalletTransactionCeilingIsk: 100_000_000,
      walletBalanceChangedThresholdIsk: 1_000_000,
    });
  });

  it('keeps a set field', () => {
    expect(defaultedThresholds({ structureFuelLowDays: 1 }).structureFuelLowDays).toBe(1);
  });
});

describe('isCharacterEventThresholds', () => {
  it('accepts an empty object and finite numbers', () => {
    expect(isCharacterEventThresholds({})).toBe(true);
    expect(isCharacterEventThresholds({ corpWalletBalanceFloorIsk: 5 })).toBe(true);
  });

  it('rejects a non-finite or non-number field, and non-objects', () => {
    expect(isCharacterEventThresholds({ structureFuelLowDays: '7' })).toBe(false);
    expect(isCharacterEventThresholds({ walletBalanceChangedThresholdIsk: NaN })).toBe(false);
    expect(isCharacterEventThresholds(null)).toBe(false);
    expect(isCharacterEventThresholds([])).toBe(false);
  });
});

describe('setThresholds', () => {
  it('copies only the fields that are set, never an undefined value', () => {
    expect(
      setThresholds({ structureFuelLowDays: 3, corpWalletBalanceFloorIsk: undefined })
    ).toEqual({
      structureFuelLowDays: 3,
    });
    expect(setThresholds(undefined)).toEqual({});
  });
});
