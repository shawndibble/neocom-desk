import { describe, expect, it } from 'vitest';
import type { ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import { refineryPlaceholder, refineryUnreadable } from './moonsFormat';
import { setupChecklist, type SetupChecklistInput } from './setupSteps';

const active: ScheduledSyncStatus = {
  status: 'active',
  characterId: 1,
  characterName: 'Varro Kestane',
  enabledAt: 0,
};

const fresh: SetupChecklistInput = {
  rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
  scheduledSync: null,
  refineries: [{ id: 11, name: 'Efa V - Moon 3 - Brass Anvil' }],
  statementCount: 0,
  today: '2026-10-18',
};

const stateOf = (input: SetupChecklistInput) =>
  Object.fromEntries(setupChecklist(input).steps.map((s) => [s.id, s.state]));

describe('setupChecklist', () => {
  it('a book just turned on has its rate set and the rest to do', () => {
    const list = setupChecklist(fresh);
    expect(list.steps.map((s) => s.id)).toEqual([
      'rate',
      'autoSync',
      'refineryNames',
      'firstStatement',
    ]);
    expect(stateOf(fresh)).toEqual({
      rate: 'done',
      autoSync: 'todo',
      refineryNames: 'done',
      firstStatement: 'todo',
    });
    expect(list.done).toBe(2);
    expect(list.complete).toBe(false);
  });

  it('carries the corp rate in force today for the rate step', () => {
    const list = setupChecklist({
      ...fresh,
      rates: [
        { scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' },
        { scope: 'corp', pct: 12, effectiveFrom: '2026-09-01' },
        { scope: 'guest', pct: 20, effectiveFrom: '2026-09-01' },
        { scope: 'corp', pct: 15, effectiveFrom: '2026-11-01' },
      ],
    });
    expect(list.corpRatePct).toBe(12);
  });

  it('quotes no rate while the only corp rate is still to start', () => {
    const list = setupChecklist({
      ...fresh,
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-11-01' }],
    });
    expect(list.corpRatePct).toBeUndefined();
  });

  it('no corp rate leaves the rate step to do', () => {
    expect(stateOf({ ...fresh, rates: [] }).rate).toBe('todo');
  });

  it('Automatic sync counts only while it runs, not once it stopped', () => {
    expect(stateOf({ ...fresh, scheduledSync: active }).autoSync).toBe('done');
    expect(stateOf({ ...fresh, scheduledSync: { ...active, status: 'stopped' } }).autoSync).toBe(
      'todo'
    );
  });

  it('an unreadable refinery leaves the names step to do and says how many', () => {
    const list = setupChecklist({
      ...fresh,
      refineries: [
        { id: 11, name: 'Brass Anvil' },
        { id: 12, name: refineryUnreadable(12) },
        { id: 13, name: refineryUnreadable(13) },
      ],
    });
    expect(list.steps.find((s) => s.id === 'refineryNames')).toEqual({
      id: 'refineryNames',
      state: 'todo',
      unreadable: 2,
    });
  });

  it('a name still being looked up is checking, neither done nor to do', () => {
    const input = {
      ...fresh,
      refineries: [
        { id: 11, name: 'Brass Anvil' },
        { id: 12, name: refineryPlaceholder(12) },
      ],
    };
    expect(stateOf(input).refineryNames).toBe('checking');
    expect(setupChecklist(input).complete).toBe(false);
  });

  it('a book with no refineries of its own (one that collects for moon owners) skips the names step', () => {
    const list = setupChecklist({ ...fresh, refineries: [] });
    expect(list.steps.map((s) => s.id)).toEqual(['rate', 'autoSync', 'firstStatement']);
  });

  it('is complete once every step is done', () => {
    const list = setupChecklist({ ...fresh, scheduledSync: active, statementCount: 3 });
    expect(list.done).toBe(4);
    expect(list.complete).toBe(true);
  });
});
