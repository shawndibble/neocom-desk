import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  DEFAULT_STATUS_FILTER,
  STATUS_FILTER_SETTING_KEY,
  useStatusFilter,
} from './statusFilterPref';
import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';

beforeEach(async () => {
  await db.settings.clear();
  useStatusFilter.setState({ value: DEFAULT_STATUS_FILTER, hydrated: false });
});

async function hydrated(): Promise<readonly MiningTaxRowStatus[]> {
  await useStatusFilter.getState().hydrate();
  return useStatusFilter.getState().value;
}

describe('useStatusFilter', () => {
  it('defaults to everything except Paid and Dismissed', async () => {
    expect(await hydrated()).toEqual(['unassigned', 'needs-review', 'outstanding']);
  });

  it('round-trips a pilot who works from the Paid list', async () => {
    await db.settings.put({ key: STATUS_FILTER_SETTING_KEY, value: ['paid'] });
    expect(await hydrated()).toEqual(['paid']);
  });

  it('rejects an empty selection rather than rendering an unexplained empty table', async () => {
    await db.settings.put({ key: STATUS_FILTER_SETTING_KEY, value: [] });
    expect(await hydrated()).toEqual(DEFAULT_STATUS_FILTER);
  });

  it.each([
    ['a status this build does not know', ['archived']],
    ['a non-string member', [1]],
    ['not an array', 'paid'],
    ['null', null],
  ])('falls back to the default for %s', async (_label, stored) => {
    await db.settings.put({ key: STATUS_FILTER_SETTING_KEY, value: stored });
    expect(await hydrated()).toEqual(DEFAULT_STATUS_FILTER);
  });

  it('persists a chosen selection', async () => {
    await useStatusFilter.getState().setValue(['outstanding', 'paid']);
    expect((await db.settings.get(STATUS_FILTER_SETTING_KEY))?.value).toEqual([
      'outstanding',
      'paid',
    ]);
  });
});
