import { describe, it, expect } from 'vitest';
import { groupColoniesIntoBatches, BATCH_WINDOW_MS } from './colonyBatches';
import type { ColonyStatus } from './types';

const HOUR = 3_600_000;
const NOW = 1_000 * HOUR;

interface TestColony {
  name: string;
  status: ColonyStatus;
}

function colony(name: string, status: Partial<ColonyStatus> = {}): TestColony {
  return { name, status: { idle: false, soonestExpiryMs: null, ...status } };
}

function running(name: string, hoursFromNow: number) {
  return colony(name, { soonestExpiryMs: NOW + hoursFromNow * HOUR });
}

describe('groupColoniesIntoBatches', () => {
  it('has nothing to say about no colonies', () => {
    expect(groupColoniesIntoBatches<TestColony>([], (c) => c.status, NOW)).toEqual([]);
  });

  /*
   * The whole reason this exists. A pilot resets every planet in one sitting,
   * so a colony is never the unit of work — the reset run is. Four rows saying
   * "3h 12m" four times is four times the reading for one trip.
   */
  it('folds colonies expiring together into one run', () => {
    const batches = groupColoniesIntoBatches(
      [running('Gehi IV', 3), running('Gehi V', 3), running('Gehi VI', 3)],
      (c) => c.status,
      NOW
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].colonies.map((c) => c.name)).toEqual(['Gehi IV', 'Gehi V', 'Gehi VI']);
  });

  it('tolerates the minutes a reset run actually takes', () => {
    // Installed one after another across a single session, so the expiries are
    // spread by however long it took to walk the list.
    const batches = groupColoniesIntoBatches(
      [running('a', 3), running('b', 3.2), running('c', 3.4)],
      (c) => c.status,
      NOW
    );
    expect(batches).toHaveLength(1);
  });

  it('splits runs that are genuinely different trips', () => {
    const batches = groupColoniesIntoBatches(
      [running('soon', 3), running('later', 50)],
      (c) => c.status,
      NOW
    );
    expect(batches).toHaveLength(2);
    expect(batches[0].colonies[0].name).toBe('soon');
  });

  it('chains through a gradual spread rather than cutting it arbitrarily', () => {
    // Each within the window of the one before it: still one visit, even
    // though the first and last are further apart than the window.
    const spread = Array.from({ length: 6 }, (_, i) =>
      running(`p${i}`, 3 + (i * BATCH_WINDOW_MS) / HOUR / 2)
    );
    expect(groupColoniesIntoBatches(spread, (c) => c.status, NOW)).toHaveLength(1);
  });

  it('puts expired colonies in their own batch, ahead of every countdown', () => {
    const batches = groupColoniesIntoBatches(
      [running('running', 3), colony('stopped', { idle: true, soonestExpiryMs: NOW - HOUR })],
      (c) => c.status,
      NOW
    );
    expect(batches[0].kind).toBe('expired');
    expect(batches[0].colonies.map((c) => c.name)).toEqual(['stopped']);
    expect(batches[1].kind).toBe('running');
  });

  /*
   * One batch, not one per expiry time. An idle colony has already stopped
   * earning, so *when* it stopped changes nothing about what to do — they are
   * all the same errand, and splitting them by their stop times would put the
   * volume back that this whole grouping removes.
   */
  it('keeps every expired colony together however long ago each stopped', () => {
    const batches = groupColoniesIntoBatches(
      [
        colony('a', { idle: true, soonestExpiryMs: NOW - HOUR }),
        colony('b', { idle: true, soonestExpiryMs: NOW - 400 * HOUR }),
      ],
      (c) => c.status,
      NOW
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].colonies).toHaveLength(2);
  });

  it('reports the run’s own deadline as its soonest member', () => {
    const batches = groupColoniesIntoBatches(
      [running('b', 3.4), running('a', 3)],
      (c) => c.status,
      NOW
    );
    expect(batches[0].expiryMs).toBe(NOW + 3 * HOUR);
  });

  it('collects colonies with no extractor at all into a last batch', () => {
    const batches = groupColoniesIntoBatches(
      [running('running', 3), colony('bare')],
      (c) => c.status,
      NOW
    );
    expect(batches.map((b) => b.kind)).toEqual(['running', 'idle']);
    expect(batches[1].expiryMs).toBeNull();
  });

  it('severities run from stopped, through the clock, to nothing to do', () => {
    const batches = groupColoniesIntoBatches(
      [
        colony('stopped', { idle: true, soonestExpiryMs: NOW - HOUR }),
        running('now', 3),
        running('later', 200),
        colony('bare'),
      ],
      (c) => c.status,
      NOW
    );
    expect(batches.map((b) => b.severity)).toEqual(['critical', 'warning', 'clear', 'clear']);
  });
});
