import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { useJournalBreakdownPref, JOURNAL_BREAKDOWN_SETTING_KEY } from './journalBreakdownPref';

beforeEach(async () => {
  await db.settings.clear();
  useJournalBreakdownPref.setState({ value: null, hydrated: false });
});

describe('useJournalBreakdownPref', () => {
  it('defaults to null (never toggled), unhydrated', () => {
    expect(useJournalBreakdownPref.getState().value).toBeNull();
    expect(useJournalBreakdownPref.getState().hydrated).toBe(false);
  });

  it('stays null after hydrating with nothing stored', async () => {
    await useJournalBreakdownPref.getState().hydrate();
    expect(useJournalBreakdownPref.getState().value).toBeNull();
    expect(useJournalBreakdownPref.getState().hydrated).toBe(true);
  });

  it('persists the choice under its key', async () => {
    await useJournalBreakdownPref.getState().setValue(false);
    expect(useJournalBreakdownPref.getState().value).toBe(false);
    expect((await db.settings.get(JOURNAL_BREAKDOWN_SETTING_KEY))?.value).toBe(false);
  });

  it.each([true, false])('applies a stored %s on hydrate', async (stored) => {
    await db.settings.put({ key: JOURNAL_BREAKDOWN_SETTING_KEY, value: stored });
    await useJournalBreakdownPref.getState().hydrate();
    expect(useJournalBreakdownPref.getState().value).toBe(stored);
  });

  it.each(['open', 1, {}])('rejects a non-boolean stored value (%j)', async (stored) => {
    await db.settings.put({ key: JOURNAL_BREAKDOWN_SETTING_KEY, value: stored });
    await useJournalBreakdownPref.getState().hydrate();
    expect(useJournalBreakdownPref.getState().value).toBeNull();
  });
});
