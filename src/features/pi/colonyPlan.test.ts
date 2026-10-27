import { describe, it, expect } from 'vitest';
import { cappedRows } from './colonyPlan';

/**
 * The card shows two instructions. Which two is a judgement, not a slice: the
 * removals are the fault to fix first, but they must not push the only line
 * that earns anything off the card.
 */
describe('cappedRows', () => {
  it('leads with removals when there is nothing to gain', () => {
    expect(cappedRows(['r1', 'r2', 'r3'], [], 2)).toEqual(['r1', 'r2']);
  });

  it('shows gains in order when nothing is idle', () => {
    expect(cappedRows([], ['g1', 'g2', 'g3'], 2)).toEqual(['g1', 'g2']);
  });

  it('never spends every slot on removals while a gain is waiting', () => {
    // Two idle schematics and one opportunity: a plain slice would show both
    // removals and bury the opportunity — the highest-paying line on the card
    // — behind "1 more in Details".
    expect(cappedRows(['r1', 'r2'], ['g1'], 2)).toEqual(['r1', 'g1']);
  });

  it('keeps the best-paying gain, not the last one', () => {
    // `planNetwork` allocates best-paying first, so the head of the list is
    // the one worth the slot.
    expect(cappedRows(['r1'], ['g1', 'g2'], 2)).toEqual(['r1', 'g1']);
  });

  it('still shows a removal first at a limit of one', () => {
    // `Math.max(1, limit - 1)` keeps the fault visible rather than dropping
    // straight to the gain it is a precondition for.
    expect(cappedRows(['r1'], ['g1'], 1)).toEqual(['r1']);
  });
});
