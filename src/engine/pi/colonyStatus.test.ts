import { describe, it, expect } from 'vitest';
import {
  EXPIRING_SOON_WINDOW_MS,
  extractorState,
  colonyStatus,
  colonyAttention,
  sortColoniesByAttention,
} from './colonyStatus';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-01T00:00:00Z');

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
});
