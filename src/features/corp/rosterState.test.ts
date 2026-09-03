import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { readPreviousRoster, recordRoster, useCorpRosterState } from './rosterState';

const CHAR_ID = 91;
const OTHER_CHAR_ID = 92;
const CORP_ID = 98000001;
const NOW = Date.parse('2026-09-03T12:00:00Z');

beforeEach(async () => {
  await db.settings.clear();
  useCorpRosterState.setState({ value: {}, hydrated: false });
});

describe('readPreviousRoster', () => {
  it('has no baseline on a first visit', async () => {
    expect(await readPreviousRoster(CHAR_ID, CORP_ID)).toBeUndefined();
  });

  it('hands back the roster the last visit recorded', async () => {
    await recordRoster(CHAR_ID, CORP_ID, [1, 2, 3], NOW);
    expect(await readPreviousRoster(CHAR_ID, CORP_ID)).toEqual([1, 2, 3]);
  });

  /**
   * A Character who changed corporation. The stored roster is not a stale
   * baseline for the new corporation, it is a different corporation's — reading
   * it would report every one of its members as having left.
   */
  it('has no baseline after a corporation change', async () => {
    await recordRoster(CHAR_ID, CORP_ID, [1, 2, 3], NOW);
    expect(await readPreviousRoster(CHAR_ID, 98000002)).toBeUndefined();
  });

  it('keeps one character baseline from disturbing another', async () => {
    await recordRoster(CHAR_ID, CORP_ID, [1, 2], NOW);
    await recordRoster(OTHER_CHAR_ID, CORP_ID, [3, 4], NOW);
    expect(await readPreviousRoster(CHAR_ID, CORP_ID)).toEqual([1, 2]);
    expect(await readPreviousRoster(OTHER_CHAR_ID, CORP_ID)).toEqual([3, 4]);
  });

  it('replaces the baseline rather than accumulating it', async () => {
    await recordRoster(CHAR_ID, CORP_ID, [1, 2], NOW);
    await recordRoster(CHAR_ID, CORP_ID, [2, 5], NOW);
    expect(await readPreviousRoster(CHAR_ID, CORP_ID)).toEqual([2, 5]);
  });

  it('survives a reload — the point of persisting it at all', async () => {
    await recordRoster(CHAR_ID, CORP_ID, [1, 2], NOW);
    useCorpRosterState.setState({ value: {}, hydrated: false });
    expect(await readPreviousRoster(CHAR_ID, CORP_ID)).toEqual([1, 2]);
  });

  /** A row written by an older shape must not be read as a real baseline. */
  it('ignores a stored value it does not recognise', async () => {
    await db.settings.put({ key: 'corp.rosterBaseline', value: { [CHAR_ID]: 'nonsense' } });
    expect(await readPreviousRoster(CHAR_ID, CORP_ID)).toBeUndefined();
  });
});
