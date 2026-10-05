import { describe, expect, it } from 'vitest';
import { CONTEXT_MENU_HOLD_MS, isLiftAfterHold } from './liftAfterHold';

const touch = { start: 1000, touch: true, menu: false };

describe('isLiftAfterHold', () => {
  it('lets a quick tap through', () => {
    expect(isLiftAfterHold(touch, 1000 + 120)).toBe(false);
  });
  it('swallows the click after a touch held for the context-menu delay', () => {
    expect(isLiftAfterHold(touch, 1000 + CONTEXT_MENU_HOLD_MS)).toBe(true);
    expect(isLiftAfterHold(touch, 1000 + CONTEXT_MENU_HOLD_MS - 1)).toBe(false);
  });
  it('never swallows a slow mouse click', () => {
    expect(isLiftAfterHold({ ...touch, touch: false }, 1000 + 5000)).toBe(false);
  });
  it('swallows the click after a press that became a context menu', () => {
    expect(isLiftAfterHold({ ...touch, menu: true }, 1000 + 50)).toBe(true);
  });
  it('lets a click with no recorded press through', () => {
    expect(isLiftAfterHold(null, 5000)).toBe(false);
  });
});
