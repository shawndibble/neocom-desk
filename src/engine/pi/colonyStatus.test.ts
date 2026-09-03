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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-09-01T00:00:00Z');

/**
 * CCP's worked example, the same baseline `extraction.test.ts` uses:
 * qty_per_cycle 6,965 on a 30-minute cycle over 14 days. Its trailing day of
 * output runs at 100% of its first day through day 1, 38% across day 3 and
 * 30% across day 4, so it straddles `EFFICIENT_WINDOW_FRACTION` between those
 * two days without either side being a near-miss.
 */
const decayingProgram: ExtractorYieldProgram = {
  pinId: 9,
  installTimeMs: NOW,
  expiryTimeMs: NOW + 14 * DAY,
  qtyPerCycle: 6965,
  cycleTimeMs: 1_800_000,
};

describe('extractorState', () => {
  it('is active when expiry is well beyond the warning window', () => {
    expect(extractorState(NOW + 48 * HOUR, NOW)).toBe('active');
  });

  it('is expiring-soon inside the warning window (boundary inclusive)', () => {
    expect(extractorState(NOW + EXPIRING_SOON_WINDOW_MS, NOW)).toBe('expiring-soon');
    expect(extractorState(NOW + HOUR, NOW)).toBe('expiring-soon');
  });

  it('is expired once now reaches expiry (boundary inclusive, not just past it)', () => {
    expect(extractorState(NOW, NOW)).toBe('expired');
    expect(extractorState(NOW - HOUR, NOW)).toBe('expired');
  });

  it('is deterministic under a fixed nowMs', () => {
    const a = extractorState(NOW + HOUR, NOW);
    const b = extractorState(NOW + HOUR, NOW);
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
        { pinId: 1, expiryTimeMs: NOW + 48 * HOUR },
        { pinId: 2, expiryTimeMs: NOW + 12 * HOUR },
        { pinId: 3, expiryTimeMs: NOW + 72 * HOUR },
      ],
      NOW
    );
    expect(status.soonestExpiryMs).toBe(NOW + 12 * HOUR);
  });

  it('is idle when any single program has already expired, even if others have not', () => {
    const status = colonyStatus(
      [
        { pinId: 1, expiryTimeMs: NOW - HOUR },
        { pinId: 2, expiryTimeMs: NOW + 48 * HOUR },
      ],
      NOW
    );
    expect(status.idle).toBe(true);
  });
});

describe('colonyAttention', () => {
  it('is idle when the colony status is idle, regardless of soonest expiry', () => {
    expect(colonyAttention({ idle: true, soonestExpiryMs: NOW + 48 * HOUR }, NOW)).toBe('idle');
  });

  it('is expiring-soon when not idle but the soonest expiry is inside the window', () => {
    expect(colonyAttention({ idle: false, soonestExpiryMs: NOW + HOUR }, NOW)).toBe(
      'expiring-soon'
    );
  });

  it('is healthy when not idle and either no extractors or expiry is far off', () => {
    expect(colonyAttention({ idle: false, soonestExpiryMs: null }, NOW)).toBe('healthy');
    expect(colonyAttention({ idle: false, soonestExpiryMs: NOW + 48 * HOUR }, NOW)).toBe('healthy');
  });
});

describe('sortColoniesByAttention', () => {
  it('orders idle first, then soonest expiry, then no-extractor colonies last', () => {
    const colonies = [
      { id: 'healthy', status: { idle: false, soonestExpiryMs: NOW + 48 * HOUR } },
      { id: 'none', status: { idle: false, soonestExpiryMs: null } },
      { id: 'idle', status: { idle: true, soonestExpiryMs: NOW - HOUR } },
      { id: 'soon', status: { idle: false, soonestExpiryMs: NOW + HOUR } },
    ];
    const sorted = sortColoniesByAttention(colonies, (c) => c.status, NOW);
    expect(sorted.map((c) => c.id)).toEqual(['idle', 'soon', 'healthy', 'none']);
  });

  it('sorts a decayed colony above a healthy one and below an idle or expiring one', () => {
    const colonies = [
      { id: 'healthy', status: { idle: false, soonestExpiryMs: NOW + 48 * HOUR, decayed: false } },
      { id: 'decayed', status: { idle: false, soonestExpiryMs: NOW + 72 * HOUR, decayed: true } },
      { id: 'idle', status: { idle: true, soonestExpiryMs: NOW - HOUR, decayed: true } },
      { id: 'soon', status: { idle: false, soonestExpiryMs: NOW + HOUR, decayed: true } },
    ];
    const sorted = sortColoniesByAttention(colonies, (c) => c.status, NOW);
    expect(sorted.map((c) => c.id)).toEqual(['idle', 'soon', 'decayed', 'healthy']);
  });
});

describe('EFFICIENT_WINDOW_FRACTION', () => {
  it("is the documented display threshold, a fraction of a program's own first-day rate", () => {
    expect(EFFICIENT_WINDOW_FRACTION).toBe(0.35);
  });
});

describe('colonyStatus decay', () => {
  it('leaves decayed absent — not false — when no program carries a yield baseline', () => {
    const status = colonyStatus([{ pinId: 1, expiryTimeMs: NOW + 48 * HOUR }], NOW);
    expect(status.decayed).toBeUndefined();
    expect('decayed' in status).toBe(false);
  });

  it('is not decayed at install, when nothing has decayed yet', () => {
    expect(colonyStatus([decayingProgram], NOW).decayed).toBe(false);
  });

  it('is not decayed four hours in, the regression this threshold exists for', () => {
    // On the old per-cycle read this fired here, with 6% of a fourteen-day
    // program banked — a badge on every colony, always.
    expect(colonyStatus([decayingProgram], NOW + 4 * HOUR).decayed).toBe(false);
  });

  it('is not decayed before a full day has elapsed, when there is no rate to compare', () => {
    expect(colonyStatus([decayingProgram], NOW + 20 * HOUR).decayed).toBe(false);
    expect(colonyStatus([decayingProgram], NOW + DAY).decayed).toBe(false);
  });

  it("is decayed by day four, once the trailing day falls under the program's window", () => {
    // Day 3 runs at 0.379 of the first day's rate, day 4 at 0.300.
    expect(colonyStatus([decayingProgram], NOW + 3 * DAY).decayed).toBe(false);
    expect(colonyStatus([decayingProgram], NOW + 4 * DAY).decayed).toBe(true);
  });

  it('is not decayed while any single projectable program is still inside its window', () => {
    const freshlyReset: ExtractorYieldProgram = {
      ...decayingProgram,
      pinId: 10,
      installTimeMs: NOW + 2 * DAY,
      expiryTimeMs: NOW + 2 * DAY + 14 * DAY,
    };
    // Two days into its own program, `freshlyReset` is at 0.547 — inside the
    // window, so the colony stays off the flag even though the other is past.
    expect(colonyStatus([decayingProgram, freshlyReset], NOW + 4 * DAY).decayed).toBe(false);
  });

  it('ignores programs with no baseline rather than counting them as fresh', () => {
    const unprojectable = { pinId: 11, expiryTimeMs: NOW + 14 * DAY };
    expect(colonyStatus([decayingProgram, unprojectable], NOW + 4 * DAY).decayed).toBe(true);
  });
});

describe('colonyAttention decayed', () => {
  it('is decayed when a non-idle, not-expiring colony is past the efficient window', () => {
    expect(
      colonyAttention({ idle: false, soonestExpiryMs: NOW + 48 * HOUR, decayed: true }, NOW)
    ).toBe('decayed');
  });

  it('stays healthy when decay is unknowable, rather than guessing', () => {
    expect(colonyAttention({ idle: false, soonestExpiryMs: NOW + 48 * HOUR }, NOW)).toBe('healthy');
  });

  it('yields to idle and expiring-soon, which are the more urgent calls', () => {
    expect(
      colonyAttention({ idle: true, soonestExpiryMs: NOW + 48 * HOUR, decayed: true }, NOW)
    ).toBe('idle');
    expect(colonyAttention({ idle: false, soonestExpiryMs: NOW + HOUR, decayed: true }, NOW)).toBe(
      'expiring-soon'
    );
  });
});
