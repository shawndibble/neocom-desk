import { describe, expect, it } from 'vitest';
import { capacitorTone } from './capacitorTone';

describe('capacitorTone', () => {
  it('is success while the capacitor is stable', () => {
    expect(capacitorTone({ stable: true, stablePercentage: 40 })).toBe('success');
  });

  it('is warning when it lasts a minute or more', () => {
    expect(capacitorTone({ stable: false, depletesInSeconds: 60 })).toBe('warning');
    expect(capacitorTone({ stable: false, depletesInSeconds: 600 })).toBe('warning');
    // Shown as "60s", so not red.
    expect(capacitorTone({ stable: false, depletesInSeconds: 59.6 })).toBe('warning');
  });

  it('is danger when it empties inside a minute', () => {
    expect(capacitorTone({ stable: false, depletesInSeconds: 59 })).toBe('danger');
    expect(capacitorTone({ stable: false, depletesInSeconds: 0 })).toBe('danger');
  });
});
