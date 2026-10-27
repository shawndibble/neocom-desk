import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_DAYS,
  ESI_WALLET_CACHE_MS,
  ESI_WALLET_WINDOW_DAYS,
  addCoverage,
  archiveGaps,
  archiveSince,
  fetchWindow,
} from './archiveCoverage';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 16, 12);

describe('fetchWindow', () => {
  it('covers ESI window back from the fetch when the list is complete', () => {
    const end = NOW - ESI_WALLET_CACHE_MS;
    expect(fetchWindow({ fetchedAt: NOW, truncated: false, oldestEntryMs: null })).toEqual([
      end - ESI_WALLET_WINDOW_DAYS * DAY,
      end,
    ]);
  });
  it('reaches the oldest entry when it is older than the window', () => {
    const old = NOW - 40 * DAY;
    expect(fetchWindow({ fetchedAt: NOW, truncated: false, oldestEntryMs: old })![0]).toBe(old);
  });
  it('covers nothing when a page failed and the list is truncated without a cursor guarantee', () => {
    expect(
      fetchWindow({ fetchedAt: NOW, truncated: true, oldestEntryMs: null, cursor: false })
    ).toBeNull();
  });
  it('covers only down to the oldest row for a cursor walk that hit its cap', () => {
    const old = NOW - 3 * DAY;
    expect(
      fetchWindow({ fetchedAt: NOW, truncated: true, oldestEntryMs: old, cursor: true })
    ).toEqual([old, NOW - ESI_WALLET_CACHE_MS]);
  });
  it('covers nothing for a truncated cursor walk with no rows', () => {
    expect(
      fetchWindow({ fetchedAt: NOW, truncated: true, oldestEntryMs: null, cursor: true })
    ).toBeNull();
  });
});

describe('addCoverage', () => {
  it('merges overlapping and touching windows', () => {
    const b = NOW - 60 * DAY;
    const a = addCoverage([], [b, b + 10 * DAY], NOW);
    expect(addCoverage(a, [b + 5 * DAY, b + 20 * DAY], NOW)).toEqual([[b, b + 20 * DAY]]);
  });
  it('keeps disjoint windows apart, sorted', () => {
    const base = NOW - 100 * DAY;
    const r = addCoverage([[base + 50 * DAY, base + 60 * DAY]], [base, base + 10 * DAY], NOW);
    expect(r).toEqual([
      [base, base + 10 * DAY],
      [base + 50 * DAY, base + 60 * DAY],
    ]);
  });
  it('drops windows wholly older than 365 days and clips the rest', () => {
    const cutoff = NOW - ARCHIVE_DAYS * DAY;
    const r = addCoverage(
      [
        [cutoff - 20 * DAY, cutoff - 10 * DAY],
        [cutoff - 5 * DAY, cutoff + 5 * DAY],
      ],
      [NOW - DAY, NOW],
      NOW
    );
    expect(r).toEqual([
      [cutoff, cutoff + 5 * DAY],
      [NOW - DAY, NOW],
    ]);
  });
});

describe('archive reach', () => {
  const cov: Array<[number, number]> = [
    [NOW - 100 * DAY, NOW - 70 * DAY],
    [NOW - 30 * DAY, NOW],
  ];
  it('since is the start of the earliest window', () => {
    expect(archiveSince(cov)).toBe(NOW - 100 * DAY);
    expect(archiveSince([])).toBeNull();
  });
  it('adds the stretch since the last window once it is older than the cache age', () => {
    const last = NOW - 3 * DAY;
    expect(archiveGaps([[last - 10 * DAY, last]], NOW)).toEqual([[last, NOW]]);
    expect(archiveGaps([[NOW - 10 * DAY, NOW - ESI_WALLET_CACHE_MS]], NOW)).toEqual([]);
  });
  it('lists the uncovered stretch between windows', () => {
    expect(archiveGaps(cov)).toEqual([[NOW - 70 * DAY, NOW - 30 * DAY]]);
    expect(archiveGaps([[0, 1]])).toEqual([]);
  });
});
