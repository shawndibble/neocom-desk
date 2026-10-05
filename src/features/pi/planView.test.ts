import { describe, it, expect } from 'vitest';
import { buildPlanView, piItemName, pruneTicks, tickableIds } from './planView';
import {
  P2_A,
  P2_B,
  RAW,
  colony,
  fixtureAdvice as advice,
  fixturePi as pi,
} from './planViewFixture';

const view = buildPlanView(advice, pi, (id) => `Planet ${id}`);

describe('buildPlanView', () => {
  it('splits the headline into quick wins and the rebuild gain on top', () => {
    expect(view.headline).toMatchObject({
      quickWinPerDay: 420,
      quickWinMinutes: 4,
      rebuildGainPerDay: 3700,
      rebuildCount: 1,
      colonyCount: 2,
    });
    expect(view.stats.m3PerWeek).toBe(700);
  });

  it('draws one strip per colony: quick-win label only when it has one, change or keep', () => {
    expect(view.strips.map((s) => [s.name, s.quickWinGainPerDay, s.rebuild.kind])).toEqual([
      ['Hek VI', 300, 'change'],
      ['Uttindar II', 120, 'keep'],
    ]);
  });

  it('keeps the model order of quick wins and marks storage as "saves"', () => {
    expect(view.quickWins.map((row) => [row.id, row.gainKind, row.action])).toEqual([
      ['1:restart', 'adds', 'restart'],
      ['2:storage', 'saves', 'storage'],
    ]);
    expect(view.quickWins[0].planetName).toBe('Hek VI');
    expect(view.quickWins[0].subject).toBe(piItemName(RAW, pi));
  });

  it('compares an alternative with the pick: ISK delta and how much less it hauls', () => {
    const card = view.rebuilds[0];
    expect(card.status).toBe('change');
    expect(card.target?.typeId).toBe(P2_A);
    expect(card.alternative).toMatchObject({ iskPerDayDelta: -1000, haulRatio: 4 });
    expect(card.anchor).toBe('plan-p1');
  });

  it('a keep card stays on what it sells, at today after quick wins, with no gain', () => {
    const card = view.rebuilds[1];
    expect(card).toMatchObject({
      status: 'keep',
      gainPerDay: null,
      fromPerDay: 1120,
      toPerDay: 1120,
      keepReason: 'already-best',
    });
    expect(card.sells.map((s) => s.typeId)).toEqual([P2_B]);
  });

  it('builds a checklist column per changed colony, steps keyed by recommendation', () => {
    expect(view.checklist).toHaveLength(1);
    const column = view.checklist[0];
    expect(column.index).toBe(1);
    expect(column.steps.map((s) => s.verb)).toEqual(['remove', 'set', 'route']);
    expect(column.steps[1].id).toBe(`1:${P2_A}:1:set`);
    expect(column.steps[2].carries).toBe(piItemName(P2_A, pi));
    expect(column.fit).toMatchObject({ level: 4, cpuPercent: 25, powerPercent: 55 });
  });

  it('prunes ticks whose row is gone', () => {
    const live = tickableIds(view);
    expect(live.has('1:restart')).toBe(true);
    expect(pruneTicks(['1:restart', '9:gone'], live)).toEqual(['1:restart']);
  });

  it('is empty when no colony has a figure', () => {
    const empty = buildPlanView(
      { ...advice, colonies: [colony({ planetId: 5, todayPerDay: null })] },
      pi,
      (id) => `Planet ${id}`
    );
    expect(empty.empty).toBe(true);
  });
});
