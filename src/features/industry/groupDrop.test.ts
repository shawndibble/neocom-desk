import { describe, it, expect } from 'vitest';
import {
  dropTargetGroupId,
  groupDropId,
  planDropId,
  planIdFromDropId,
  resolveGroupDrop,
} from './groupDrop';

/** planId -> its group. Absent means ungrouped, exactly as the list renders it. */
const GROUPS = new Map([
  ['raven', 'fleet'],
  ['rifter', 'fleet'],
  ['drake', 'spare'],
]);

describe('drop ids', () => {
  it('keeps a group id and a plan id of the same string apart', () => {
    expect(groupDropId('x')).not.toBe(planDropId('x'));
  });

  it('reads a plan id back out of its draggable id', () => {
    expect(planIdFromDropId(planDropId('raven'))).toBe('raven');
  });

  it('refuses a group id, and anything not from this list, as a plan id', () => {
    expect(planIdFromDropId(groupDropId('fleet'))).toBeNull();
    expect(planIdFromDropId('raven')).toBeNull();
  });

  it('survives a plan id that itself looks like a prefixed id', () => {
    const id = planDropId(groupDropId('fleet'));
    expect(planIdFromDropId(id)).toBe(groupDropId('fleet'));
  });
});

describe('dropTargetGroupId', () => {
  it('lands in the group whose header was dropped on — the collapsed-group case', () => {
    expect(dropTargetGroupId(groupDropId('fleet'), GROUPS)).toBe('fleet');
  });

  it('lands in the group owning the plan row dropped on', () => {
    expect(dropTargetGroupId(planDropId('drake'), GROUPS)).toBe('spare');
  });

  it('lands nowhere — null, not undefined — on an ungrouped plan row', () => {
    expect(dropTargetGroupId(planDropId('loner'), GROUPS)).toBeNull();
  });

  it('reports no target at all when the drop missed every droppable', () => {
    expect(dropTargetGroupId(null, GROUPS)).toBeUndefined();
    expect(dropTargetGroupId(undefined, GROUPS)).toBeUndefined();
    expect(dropTargetGroupId('some-other-widget', GROUPS)).toBeUndefined();
  });
});

describe('resolveGroupDrop', () => {
  it('moves an ungrouped plan into the group it was dropped on', () => {
    expect(resolveGroupDrop(planDropId('loner'), groupDropId('fleet'), GROUPS)).toEqual({
      planId: 'loner',
      groupId: 'fleet',
    });
  });

  it('moves a plan between groups', () => {
    expect(resolveGroupDrop(planDropId('drake'), groupDropId('fleet'), GROUPS)).toEqual({
      planId: 'drake',
      groupId: 'fleet',
    });
  });

  it('takes a plan out of its group when dropped on an ungrouped row', () => {
    expect(resolveGroupDrop(planDropId('raven'), planDropId('loner'), GROUPS)).toEqual({
      planId: 'raven',
      groupId: null,
    });
  });

  it('changes nothing when the plan is dropped back into its own group', () => {
    expect(resolveGroupDrop(planDropId('raven'), groupDropId('fleet'), GROUPS)).toBeNull();
    expect(resolveGroupDrop(planDropId('raven'), planDropId('rifter'), GROUPS)).toBeNull();
  });

  it('changes nothing when an ungrouped plan is dropped on another ungrouped row', () => {
    expect(resolveGroupDrop(planDropId('loner'), planDropId('stray'), GROUPS)).toBeNull();
  });

  it('changes nothing when a plan is dropped on itself', () => {
    expect(resolveGroupDrop(planDropId('raven'), planDropId('raven'), GROUPS)).toBeNull();
  });

  it('changes nothing when the drop missed every droppable', () => {
    expect(resolveGroupDrop(planDropId('raven'), null, GROUPS)).toBeNull();
  });

  it('ignores a drag that did not start on a plan row', () => {
    expect(resolveGroupDrop(groupDropId('fleet'), groupDropId('spare'), GROUPS)).toBeNull();
  });
});
