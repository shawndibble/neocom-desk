import { DAY_MS, HOUR_MS } from '@/lib/age';
import { describe, it, expect } from 'vitest';
import {
  EFFICIENT_WINDOW_FRACTION,
  EXPIRING_SOON_WINDOW_MS,
  extractorState,
  colonyStatus,
  colonyAttention,
  sortColoniesByAttention,
} from './colonyStatus';
import type { ExtractorYieldProgram } from './types';

const NOW = Date.parse('2026-09-01T00:00:00Z');

const decayingProgram: ExtractorYieldProgram = {
  pinId: 9,
  installTimeMs: NOW,
  expiryTimeMs: NOW + 14 * DAY_MS,
  qtyPerCycle: 6965,
  cycleTimeMs: 1_800_000,
};

describe('extractorState', () => {
  it('is active when expiry is well beyond the warning window', () => {
    expect(extractorState(NOW + 48 * HOUR_MS, NOW)).toBe('active');
  });

  it('is expiring-soon inside the warning window (boundary inclusive)', () => {
    expect(extractorState(NOW + EXPIRING_SOON_WINDOW_MS, NOW)).toBe('expiring-soon');
    expect(extractorState(NOW + HOUR_MS, NOW)).toBe('expiring-soon');
  });

  it('is expired once now reaches expiry (boundary inclusive, not just past it)', () => {
    expect(extractorState(NOW, NOW)).toBe('expired');
    expect(extractorState(NOW - HOUR_MS, NOW)).toBe('expired');
  });

  it('takes the pilot’s own warning window when one is given', () => {
    expect(extractorState(NOW + 36 * HOUR_MS, NOW, 48 * HOUR_MS)).toBe('expiring-soon');
    expect(extractorState(NOW + 36 * HOUR_MS, NOW)).toBe('active');
  });

  it('still reports expired regardless of how wide the window is', () => {
    expect(extractorState(NOW - HOUR_MS, NOW, 72 * HOUR_MS)).toBe('expired');
  });

  it('is deterministic under a fixed nowMs', () => {
    const a = extractorState(NOW + HOUR_MS, NOW);
    const b = extractorState(NOW + HOUR_MS, NOW);
    expect(a).toBe(b);
  });
});

describe('colonyStatus', () => {
  it('reports not idle with a null soonest expiry for a colony with no extractor programs', () => {
    expect(colonyStatus([], NOW)).toEqual({ idle: false, soonestExpiryMs: null });
  });

  it('reports the soonest expiry across multiple programs', () => {
    const status = colonyStatus(
      [
        { pinId: 1, expiryTimeMs: NOW + 48 * HOUR_MS },
        { pinId: 2, expiryTimeMs: NOW + 12 * HOUR_MS },
        { pinId: 3, expiryTimeMs: NOW + 72 * HOUR_MS },
      ],
      NOW
    );
    expect(status.soonestExpiryMs).toBe(NOW + 12 * HOUR_MS);
  });

  it('is idle when any single program has already expired, even if others have not', () => {
    const status = colonyStatus(
      [
        { pinId: 1, expiryTimeMs: NOW - HOUR_MS },
        { pinId: 2, expiryTimeMs: NOW + 48 * HOUR_MS },
      ],
      NOW
    );
    expect(status.idle).toBe(true);
  });
});

describe('colonyAttention', () => {
  it('is idle when the colony status is idle, regardless of soonest expiry', () => {
    expect(colonyAttention({ idle: true, soonestExpiryMs: NOW + 48 * HOUR_MS }, NOW)).toBe('idle');
  });

  it('is expiring-soon when not idle but the soonest expiry is inside the window', () => {
    expect(colonyAttention({ idle: false, soonestExpiryMs: NOW + HOUR_MS }, NOW)).toBe(
      'expiring-soon'
    );
  });

  it('is healthy when not idle and either no extractors or expiry is far off', () => {
    expect(colonyAttention({ idle: false, soonestExpiryMs: null }, NOW)).toBe('healthy');
    expect(colonyAttention({ idle: false, soonestExpiryMs: NOW + 48 * HOUR_MS }, NOW)).toBe(
      'healthy'
    );
  });

  it('takes the pilot’s own warning window when one is given', () => {
    const status = { idle: false, soonestExpiryMs: NOW + 36 * HOUR_MS };
    expect(colonyAttention(status, NOW, 48 * HOUR_MS)).toBe('expiring-soon');
    expect(colonyAttention(status, NOW)).toBe('healthy');
  });
});

describe('sortColoniesByAttention', () => {
  it('orders idle first, then soonest expiry, then no-extractor colonies last', () => {
    const colonies = [
      { id: 'healthy', status: { idle: false, soonestExpiryMs: NOW + 48 * HOUR_MS } },
      { id: 'none', status: { idle: false, soonestExpiryMs: null } },
      { id: 'idle', status: { idle: true, soonestExpiryMs: NOW - HOUR_MS } },
      { id: 'soon', status: { idle: false, soonestExpiryMs: NOW + HOUR_MS } },
    ];
    const sorted = sortColoniesByAttention(colonies, (c) => c.status, NOW);
    expect(sorted.map((c) => c.id)).toEqual(['idle', 'soon', 'healthy', 'none']);
  });

  it('sorts a decayed colony above a healthy one and below an idle or expiring one', () => {
    const colonies = [
      {
        id: 'healthy',
        status: { idle: false, soonestExpiryMs: NOW + 48 * HOUR_MS, decayed: false },
      },
      {
        id: 'decayed',
        status: { idle: false, soonestExpiryMs: NOW + 72 * HOUR_MS, decayed: true },
      },
      { id: 'idle', status: { idle: true, soonestExpiryMs: NOW - HOUR_MS, decayed: true } },
      { id: 'soon', status: { idle: false, soonestExpiryMs: NOW + HOUR_MS, decayed: true } },
    ];
    const sorted = sortColoniesByAttention(colonies, (c) => c.status, NOW);
    expect(sorted.map((c) => c.id)).toEqual(['idle', 'soon', 'decayed', 'healthy']);
  });

  it('re-ranks colonies when the pilot widens the warning window', () => {
    const colonies = [
      {
        id: 'decayed',
        status: { idle: false, soonestExpiryMs: NOW + 72 * HOUR_MS, decayed: true },
      },
      { id: 'thirtySix', status: { idle: false, soonestExpiryMs: NOW + 36 * HOUR_MS } },
    ];
    expect(sortColoniesByAttention(colonies, (c) => c.status, NOW).map((c) => c.id)).toEqual([
      'decayed',
      'thirtySix',
    ]);
    expect(
      sortColoniesByAttention(colonies, (c) => c.status, NOW, 48 * HOUR_MS).map((c) => c.id)
    ).toEqual(['thirtySix', 'decayed']);
  });
});

describe('EFFICIENT_WINDOW_FRACTION', () => {
  it("is the documented display threshold, a fraction of a program's own first-day rate", () => {
    expect(EFFICIENT_WINDOW_FRACTION).toBe(0.35);
  });
});

describe('colonyStatus decay', () => {
  it('leaves decayed absent — not false — when no program carries a yield baseline', () => {
    const status = colonyStatus([{ pinId: 1, expiryTimeMs: NOW + 48 * HOUR_MS }], NOW);
    expect(status.decayed).toBeUndefined();
    expect('decayed' in status).toBe(false);
  });

  it('is not decayed at install, when nothing has decayed yet', () => {
    expect(colonyStatus([decayingProgram], NOW).decayed).toBe(false);
  });

  it('is not decayed four hours in, the regression this threshold exists for', () => {
    expect(colonyStatus([decayingProgram], NOW + 4 * HOUR_MS).decayed).toBe(false);
  });

  it('is not decayed before a full day has elapsed, when there is no rate to compare', () => {
    expect(colonyStatus([decayingProgram], NOW + 20 * HOUR_MS).decayed).toBe(false);
    expect(colonyStatus([decayingProgram], NOW + DAY_MS).decayed).toBe(false);
  });

  it("is decayed by day four, once the trailing day falls under the program's window", () => {
    expect(colonyStatus([decayingProgram], NOW + 3 * DAY_MS).decayed).toBe(false);
    expect(colonyStatus([decayingProgram], NOW + 4 * DAY_MS).decayed).toBe(true);
  });

  it('is not decayed while any single projectable program is still inside its window', () => {
    const freshlyReset: ExtractorYieldProgram = {
      ...decayingProgram,
      pinId: 10,
      installTimeMs: NOW + 2 * DAY_MS,
      expiryTimeMs: NOW + 2 * DAY_MS + 14 * DAY_MS,
    };
    expect(colonyStatus([decayingProgram, freshlyReset], NOW + 4 * DAY_MS).decayed).toBe(false);
  });

  it('ignores programs with no baseline rather than counting them as fresh', () => {
    const unprojectable = { pinId: 11, expiryTimeMs: NOW + 14 * DAY_MS };
    expect(colonyStatus([decayingProgram, unprojectable], NOW + 4 * DAY_MS).decayed).toBe(true);
  });
});

describe('colonyAttention decayed', () => {
  it('is decayed when a non-idle, not-expiring colony is past the efficient window', () => {
    expect(
      colonyAttention({ idle: false, soonestExpiryMs: NOW + 48 * HOUR_MS, decayed: true }, NOW)
    ).toBe('decayed');
  });

  it('stays healthy when decay is unknowable, rather than guessing', () => {
    expect(colonyAttention({ idle: false, soonestExpiryMs: NOW + 48 * HOUR_MS }, NOW)).toBe(
      'healthy'
    );
  });

  it('yields to idle and expiring-soon, which are the more urgent calls', () => {
    expect(
      colonyAttention({ idle: true, soonestExpiryMs: NOW + 48 * HOUR_MS, decayed: true }, NOW)
    ).toBe('idle');
    expect(
      colonyAttention({ idle: false, soonestExpiryMs: NOW + HOUR_MS, decayed: true }, NOW)
    ).toBe('expiring-soon');
  });
});
