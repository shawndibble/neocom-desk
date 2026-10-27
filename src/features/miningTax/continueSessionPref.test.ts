import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { useAutoContinueSessions, useDismissedContinuations } from './continueSessionPref';

beforeEach(async () => {
  await db.settings.clear();
  useAutoContinueSessions.setState({ value: false, hydrated: false });
  useDismissedContinuations.setState({ value: [], hydrated: false });
});

describe('continueSessionPref', () => {
  it('is asked, not automatic, until the pilot opts in', async () => {
    await useAutoContinueSessions.getState().hydrate();
    expect(useAutoContinueSessions.getState().value).toBe(false);
  });

  it('restores an opt-in and the entries kept separate', async () => {
    await db.settings.put({ key: 'miningTaxAutoContinue', value: true });
    await db.settings.put({
      key: 'miningTaxDismissedContinuations',
      value: ['1:2026-10-05:3:unassigned'],
    });
    await useAutoContinueSessions.getState().hydrate();
    await useDismissedContinuations.getState().hydrate();
    expect(useAutoContinueSessions.getState().value).toBe(true);
    expect(useDismissedContinuations.getState().value).toEqual(['1:2026-10-05:3:unassigned']);
  });

  it('ignores a stored value of the wrong shape', async () => {
    await db.settings.put({ key: 'miningTaxAutoContinue', value: 'yes' });
    await db.settings.put({ key: 'miningTaxDismissedContinuations', value: [1, 2] });
    await useAutoContinueSessions.getState().hydrate();
    await useDismissedContinuations.getState().hydrate();
    expect(useAutoContinueSessions.getState().value).toBe(false);
    expect(useDismissedContinuations.getState().value).toEqual([]);
  });
});
