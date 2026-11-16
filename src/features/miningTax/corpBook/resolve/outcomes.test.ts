import { describe, expect, it } from 'vitest';
import { notOwedPlan, outcomesFor, type ResolveProblem } from './outcomes';

const base = { corporationId: 1, corpName: 'Brass', characterId: 7 };
const row = (over: object = {}) => ({ recordKey: '7:1000:2026-11-06', ...over }) as never;

describe('notOwedPlan', () => {
  it('is a rate dispute at the member rate, the excess ore, or the payee, and otherwise nothing', () => {
    expect(
      notOwedPlan(row({ dispute: { rate: true, quantity: false, personalPct: 10, bookPct: 12 } }))
    ).toEqual({ kind: 'rate', pct: 10 });
    expect(
      notOwedPlan(
        row({
          oreLines: [{ typeId: 1, quantity: 9 }],
          personalOreLines: [{ typeId: 1, quantity: 5 }],
        })
      )
    ).toEqual({ kind: 'quantity', lines: [{ typeId: 1, quantity: 4 }] });
    expect(notOwedPlan(row({ state: 'conflict' }))).toEqual({ kind: 'payee' });
    expect(notOwedPlan(row())).toBeUndefined();
    expect(notOwedPlan(undefined)).toBeUndefined();
  });

  // A kept bill whose figures now agree still lets the member say the same thing again.
  it('says a kept dispute again from its own claim when the figures no longer show it', () => {
    const kept = (flagged: object) => row({ flagged: { state: 'rejected', at: 'x', ...flagged } });
    expect(notOwedPlan(kept({ kind: 'quantity', lines: [{ typeId: 1, quantity: 4 }] }))).toEqual({
      kind: 'quantity',
      lines: [{ typeId: 1, quantity: 4 }],
    });
    expect(notOwedPlan(kept({ kind: 'rate', claimedPct: 3 }))).toEqual({ kind: 'rate', pct: 3 });
    expect(notOwedPlan(kept({ kind: 'quantity' }))).toBeUndefined();
    expect(
      notOwedPlan(row({ flagged: { state: 'sent', at: 'x', kind: 'rate', claimedPct: 3 } }))
    ).toBeUndefined();
  });
});

describe('outcomesFor (resolving in the app)', () => {
  it('offers self-service first and preselects sending the proof for uncredited donations, never disputing them', () => {
    const p: ResolveProblem = {
      ...base,
      kind: 'uncredited',
      amount: 40,
      statementId: 's1',
      row: row(),
    };
    expect(outcomesFor(p)).toEqual({
      outcomes: ['pay', 'notPaying', 'paid'],
      preselected: 'paid',
      tellWhy: true,
      noStatement: false,
    });
  });

  // A preselected outcome whose button is disabled would greet the member with a dead dialog.
  it('does not preselect sending the proof when there is no Statement to send it on', () => {
    const p: ResolveProblem = { ...base, kind: 'uncredited', amount: 40, row: row() };
    expect(outcomesFor(p)).toMatchObject({ preselected: 'pay', noStatement: true });
  });

  it('preselects disputing a figure the book bills higher, and paying one it bills lower', () => {
    const owes = row({
      dispute: { rate: true, quantity: false, personalPct: 10, bookPct: 12 },
    });
    const higher: ResolveProblem = { ...base, kind: 'figure', row: owes, bookAsksMore: true };
    expect(outcomesFor(higher)).toMatchObject({
      outcomes: ['pay', 'notPaying', 'notOwed'],
      preselected: 'notOwed',
    });
    const lower: ResolveProblem = { ...base, kind: 'figure', row: owes, bookAsksMore: false };
    expect(outcomesFor(lower).preselected).toBe('pay');
  });

  it('offers fixing your own records first on a Conflict, and no paying: nothing is billed yet', () => {
    const p: ResolveProblem = { ...base, kind: 'conflict', row: row() };
    expect(outcomesFor(p)).toMatchObject({
      outcomes: ['fixRecords', 'notPaying', 'notOwed'],
      preselected: 'fixRecords',
    });
  });

  // The member may say it again: the hold does not renew, but the answer can change.
  it('after an officer kept the bill, offers paying, hiding, and saying it again', () => {
    const dispute: ResolveProblem = {
      ...base,
      kind: 'kept',
      row: row({
        personalOreLines: [{ typeId: 1, quantity: 5 }],
        oreLines: [{ typeId: 1, quantity: 9 }],
        flagged: { state: 'rejected', kind: 'quantity' },
      }),
      by: 'dispute',
      nextStep: 'Pay it',
    };
    expect(outcomesFor(dispute)).toMatchObject({
      outcomes: ['pay', 'notPaying', 'notOwed'],
      preselected: 'pay',
      tellWhy: false,
    });
    const declaration: ResolveProblem = {
      ...base,
      kind: 'kept',
      row: row(),
      by: 'declaration',
      statementId: 's1',
    };
    expect(outcomesFor(declaration).outcomes).toEqual(['pay', 'notPaying', 'paid']);
  });

  it('does not offer disputing a kept day the member own record never disagreed with', () => {
    const p: ResolveProblem = {
      ...base,
      kind: 'kept',
      row: row({ flagged: { state: 'rejected', kind: 'notPaying' } }),
      by: 'dispute',
    };
    expect(outcomesFor(p).outcomes).toEqual(['pay', 'notPaying']);
  });

  it('offers paying, not paying and proof on an Overdue Statement', () => {
    const p: ResolveProblem = { ...base, kind: 'overdue', statementId: 's1', period: 'Oct' };
    expect(outcomesFor(p)).toMatchObject({
      outcomes: ['pay', 'notPaying', 'paid'],
      preselected: 'pay',
      noStatement: false,
      tellWhy: false,
    });
  });

  it('offers disputing a figure only when the member own record gives something to dispute', () => {
    const p: ResolveProblem = { ...base, kind: 'figure', bookAsksMore: true, row: row() };
    expect(outcomesFor(p)).toMatchObject({ outcomes: ['pay', 'notPaying'], preselected: 'pay' });
  });

  it('cannot tell the corporation why on a day with no book record to name', () => {
    const p: ResolveProblem = { ...base, kind: 'uncredited', amount: 40, statementId: 's1' };
    expect(outcomesFor(p)).toMatchObject({
      outcomes: ['pay', 'notPaying', 'paid'],
      tellWhy: false,
    });
  });
});
