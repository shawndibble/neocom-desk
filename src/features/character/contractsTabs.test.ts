import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { contractsTabs, readContractsTab } from '@/features/character/contractsTabs';

describe('readContractsTab', () => {
  it('reads the Search tab out of the query string', () => {
    expect(readContractsTab('search')).toBe('search');
  });

  it('falls back to History for an absent, unknown or stale value', () => {
    expect(readContractsTab(null)).toBe('history');
    expect(readContractsTab('history')).toBe('history');
    expect(readContractsTab('sourcing')).toBe('history');
    expect(readContractsTab('')).toBe('history');
  });
});

describe('contractsTabs', () => {
  it('lists History first, then Search, labelled through i18n', () => {
    const t = ((key: string) => key) as unknown as TFunction;
    expect(contractsTabs(t)).toEqual([
      { id: 'history', label: 'contracts.historyTab' },
      { id: 'search', label: 'contracts.searchTab' },
    ]);
  });
});
