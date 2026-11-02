import { describe, expect, it } from 'vitest';
import { isRenamePlaceState, RENAME_PLACE_STATE } from './renamePlaceState';

describe('isRenamePlaceState', () => {
  it('recognises the state the Rename menu item sends', () => {
    expect(isRenamePlaceState(RENAME_PLACE_STATE)).toBe(true);
  });

  it('ignores anything else', () => {
    expect(isRenamePlaceState(null)).toBe(false);
    expect(isRenamePlaceState({ renamePlace: 'yes' })).toBe(false);
    expect(isRenamePlaceState(undefined)).toBe(false);
  });
});
