import { describe, it, expect } from 'vitest';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { deriveQueueHealth } from './queueHealthDerivation';

const NOW = Date.parse('2026-01-01T12:00:00Z');

function entry(overrides: Partial<SkillQueueEntry> & { queue_position: number }): SkillQueueEntry {
  return { skill_id: 1, finished_level: 1, ...overrides };
}

describe('deriveQueueHealth', () => {
  it('reports unknown for a character with no cached queue data', () => {
    expect(deriveQueueHealth(undefined, NOW)).toBe('unknown');
  });

  it('reports idle for an empty cached queue', () => {
    expect(deriveQueueHealth([], NOW)).toBe('idle');
  });

  it('reports paused when queued entries have no start/finish dates', () => {
    const entries = [entry({ queue_position: 0 }), entry({ queue_position: 1 })];
    expect(deriveQueueHealth(entries, NOW)).toBe('paused');
  });

  it('never reports a paused queue as "starts now" or idle', () => {
    const entries = [entry({ queue_position: 0 })];
    const state = deriveQueueHealth(entries, NOW);
    expect(state).not.toBe('training');
    expect(state).not.toBe('idle');
    expect(state).toBe('paused');
  });

  it('reports training when the last queued entry is not close to finishing', () => {
    const entries = [
      entry({
        queue_position: 0,
        start_date: new Date(NOW - 60_000).toISOString(),
        finish_date: new Date(NOW + 60_000).toISOString(),
      }),
      entry({
        queue_position: 1,
        start_date: new Date(NOW + 60_000).toISOString(),
        finish_date: new Date(NOW + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(deriveQueueHealth(entries, NOW)).toBe('training');
  });

  it('reports endingSoon when the last queued entry finishes within the threshold', () => {
    const entries = [
      entry({
        queue_position: 0,
        start_date: new Date(NOW - 60_000).toISOString(),
        finish_date: new Date(NOW + 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(deriveQueueHealth(entries, NOW)).toBe('endingSoon');
  });

  it('reports training (not endingSoon) when the last entry finishes well beyond the threshold', () => {
    const entries = [
      entry({
        queue_position: 0,
        start_date: new Date(NOW - 60_000).toISOString(),
        finish_date: new Date(NOW + 10 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(deriveQueueHealth(entries, NOW)).toBe('training');
  });

  it('reports idle when every queued entry is already completed (stale-until-login ESI leftovers)', () => {
    const entries = [
      entry({
        queue_position: 0,
        start_date: new Date(NOW - 120_000).toISOString(),
        finish_date: new Date(NOW - 60_000).toISOString(),
      }),
    ];
    expect(deriveQueueHealth(entries, NOW)).toBe('idle');
  });
});
