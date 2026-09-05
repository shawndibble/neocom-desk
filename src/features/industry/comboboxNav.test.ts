import { describe, it, expect } from 'vitest';
import { moveHighlight } from './comboboxNav';

describe('moveHighlight', () => {
  it('has nothing to highlight when there are no options', () => {
    expect(moveHighlight('ArrowDown', null, 0)).toBeNull();
    expect(moveHighlight('ArrowUp', 0, 0)).toBeNull();
    expect(moveHighlight('Home', null, 0)).toBeNull();
    expect(moveHighlight('End', null, 0)).toBeNull();
  });

  it('ArrowDown from nothing highlighted starts at the first option', () => {
    expect(moveHighlight('ArrowDown', null, 3)).toBe(0);
  });

  it('ArrowDown moves to the next option', () => {
    expect(moveHighlight('ArrowDown', 0, 3)).toBe(1);
    expect(moveHighlight('ArrowDown', 1, 3)).toBe(2);
  });

  it('ArrowDown wraps from the last option back to the first', () => {
    expect(moveHighlight('ArrowDown', 2, 3)).toBe(0);
  });

  it('ArrowUp from nothing highlighted starts at the last option', () => {
    expect(moveHighlight('ArrowUp', null, 3)).toBe(2);
  });

  it('ArrowUp moves to the previous option', () => {
    expect(moveHighlight('ArrowUp', 2, 3)).toBe(1);
    expect(moveHighlight('ArrowUp', 1, 3)).toBe(0);
  });

  it('ArrowUp wraps from the first option back to the last', () => {
    expect(moveHighlight('ArrowUp', 0, 3)).toBe(2);
  });

  it('Home jumps to the first option regardless of the current one', () => {
    expect(moveHighlight('Home', 2, 3)).toBe(0);
    expect(moveHighlight('Home', null, 3)).toBe(0);
  });

  it('End jumps to the last option regardless of the current one', () => {
    expect(moveHighlight('End', 0, 3)).toBe(2);
    expect(moveHighlight('End', null, 3)).toBe(2);
  });

  it('a single option stays highlighted on itself', () => {
    expect(moveHighlight('ArrowDown', 0, 1)).toBe(0);
    expect(moveHighlight('ArrowUp', 0, 1)).toBe(0);
  });
});
