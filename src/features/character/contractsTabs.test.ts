import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { contractsTabs, readContractsTab } from '@/features/character/contractsTabs';

describe('readContractsTab', () => {
  it('reads the History tab out of the query string', () => {
    expect(readContractsTab('history')).toBe('history');
  });

  it('falls back to Search for an absent, unknown or stale value', () => {
    expect(readContractsTab(null)).toBe('search');
    expect(readContractsTab('sourcing')).toBe('search');
    expect(readContractsTab('')).toBe('search');
  });

  it('still honours the `?tab=search` links written before Search became the default', () => {
    expect(readContractsTab('search')).toBe('search');
  });
});

describe('contractsTabs', () => {
  it('lists Search first, then History, labelled through i18n', () => {
    const t = ((key: string) => key) as unknown as TFunction;
    expect(contractsTabs(t)).toEqual([
      { id: 'search', label: 'contracts.searchTab' },
      { id: 'history', label: 'contracts.historyTab' },
    ]);
  });
});
