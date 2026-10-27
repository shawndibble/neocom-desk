import { describe, expect, it } from 'vitest';
import { ALERTS_POLL_STATS_KEYS, SERVER_POLL_STATS_KEYS, createRunStats } from './runStats.js';

describe('createRunStats', () => {
  it('declares every field up front so a zero is logged, not missing', () => {
    const stats = createRunStats(['a', 'b']);
    stats.add('a');
    stats.add('a', 2);
    expect(stats.snapshot()).toEqual({ a: 3, b: 0 });
  });

  it('keeps the field names the owner queries stable', () => {
    expect(ALERTS_POLL_STATS_KEYS).toContain('tokenRotationWrites');
    expect(ALERTS_POLL_STATS_KEYS).toContain('grantsSkippedIdle');
    expect(SERVER_POLL_STATS_KEYS).toContain('devicesSkippedDormant');
  });
});
