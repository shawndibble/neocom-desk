import { describe, expect, it } from 'vitest';
import { shownAddedM3, shownFreeM3, shownUsedM3 } from './format';

describe('shown hold figures', () => {
  const before = [{ capacityM3: 64_500, usedM3: 20_031.4 }];
  const after = [{ capacityM3: 64_500, usedM3: 20_043.8 }];

  it('rounds used per hold, and free from the same rounding', () => {
    expect(shownUsedM3(before)).toBe(20_031);
    expect(shownFreeM3(before)).toBe(44_469);
    expect(shownUsedM3(before) + shownFreeM3(before)).toBe(64_500);
  });

  it('says what a change added as the shown figures move: free before less it is free after', () => {
    const added = shownAddedM3(before, after, 12.4);
    expect(added).toBe(13);
    expect(shownFreeM3(before) - added).toBe(shownFreeM3(after));
  });

  it('keeps a change too small to move them, and never counts an overfilled hold’s free as negative', () => {
    expect(shownAddedM3(before, [{ capacityM3: 64_500, usedM3: 20_031.6 - 0.3 }], 0.3)).toBe(0.3);
    expect(shownFreeM3([{ capacityM3: 100, usedM3: 140 }])).toBe(0);
  });
});
