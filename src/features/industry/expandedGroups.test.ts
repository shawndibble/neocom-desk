import { describe, expect, it } from 'vitest';
import {
  isGroupExpanded,
  parseExpandedGroups,
  withGroupExpanded,
  type ExpandedGroupsValue,
} from './expandedGroups';

describe('parseExpandedGroups', () => {
  it('reads a well-formed per-Character map', () => {
    expect(parseExpandedGroups({ 1: ['g1', 'g2'] })).toEqual({ 1: ['g1', 'g2'] });
  });

  it('rejects anything that is not a map', () => {
    expect(parseExpandedGroups(null)).toBeNull();
    expect(parseExpandedGroups(['g1'])).toBeNull();
    expect(parseExpandedGroups('g1')).toBeNull();
  });

  it('drops damaged entries without losing the others', () => {
    const raw = { 1: ['g1', 42, ''], 2: 'not an array', notANumber: ['g9'] };
    expect(parseExpandedGroups(raw)).toEqual({ 1: ['g1'] });
  });
});

describe('isGroupExpanded', () => {
  it('is false for a group nobody has opened — collapsed is the default', () => {
    // The whole reason expanded ids are stored rather than collapsed ones: a
    // group synced in from another device has no entry here, and must arrive
    // collapsed rather than unfolding a 25-plan fit on this screen.
    expect(isGroupExpanded({}, 1, 'g1')).toBe(false);
  });

  it('is true only for that Character', () => {
    const value: ExpandedGroupsValue = { 1: ['g1'] };
    expect(isGroupExpanded(value, 1, 'g1')).toBe(true);
    expect(isGroupExpanded(value, 2, 'g1')).toBe(false);
  });
});

describe('withGroupExpanded', () => {
  it('opens a group', () => {
    expect(withGroupExpanded({}, 1, 'g1', true)).toEqual({ 1: ['g1'] });
  });

  it('closes a group', () => {
    expect(withGroupExpanded({ 1: ['g1', 'g2'] }, 1, 'g1', false)).toEqual({ 1: ['g2'] });
  });

  it('drops the Character entirely once nothing is open', () => {
    expect(withGroupExpanded({ 1: ['g1'] }, 1, 'g1', false)).toEqual({});
  });

  it('leaves other Characters alone', () => {
    const next = withGroupExpanded({ 2: ['x'] }, 1, 'g1', true);
    expect(next).toEqual({ 1: ['g1'], 2: ['x'] });
  });

  it('does not duplicate an already-open group', () => {
    expect(withGroupExpanded({ 1: ['g1'] }, 1, 'g1', true)).toEqual({ 1: ['g1'] });
  });

  it('returns the same value when nothing changed, so no needless write happens', () => {
    const value: ExpandedGroupsValue = { 1: ['g1'] };
    expect(withGroupExpanded(value, 1, 'g1', true)).toBe(value);
    expect(withGroupExpanded(value, 1, 'missing', false)).toBe(value);
  });
});
