import { beforeEach, describe, expect, it } from 'vitest';
import { PENDING_SCAN_TTL_MS, stashPendingScan, takePendingScan } from './pendingScan';

const ROW = 'Veldspar\t10\t5 m3\t1.00 ISK\t20 km';

beforeEach(() => localStorage.clear());

describe('pending scan', () => {
  it('hands back the stashed text once, then nothing', () => {
    stashPendingScan(ROW, 1000);
    expect(takePendingScan(2000)).toBe(ROW);
    expect(takePendingScan(2000)).toBeNull();
  });

  it('is gone after its short life, and the leftover is cleared', () => {
    stashPendingScan(ROW, 1000);
    expect(takePendingScan(1000 + PENDING_SCAN_TTL_MS + 1)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('keeps only the latest paste', () => {
    stashPendingScan('first', 1000);
    stashPendingScan(ROW, 1500);
    expect(takePendingScan(2000)).toBe(ROW);
  });

  it('ignores a malformed stash', () => {
    localStorage.setItem('miningSurveyPendingScan', '{not json');
    expect(takePendingScan(2000)).toBeNull();
    localStorage.setItem('miningSurveyPendingScan', JSON.stringify({ text: 5, at: 'x' }));
    expect(takePendingScan(2000)).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => stashPendingScan(ROW, 1000)).not.toThrow();
    } finally {
      Storage.prototype.setItem = real;
    }
  });
});
