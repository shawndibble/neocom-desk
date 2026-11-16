import { describe, expect, it } from 'vitest';
import { outcomesFor, type ResolveProblem } from './outcomes';

const base = { corporationId: 1, corpName: 'Brass', characterId: 7 };
const row = (over: object = {}) => ({ recordKey: '7:1000:2026-11-06', ...over }) as never;

describe('outcomesFor (resolving in the app)', () => {
  it('offers self-service first and preselects sending the proof for uncredited donations', () => {
    const p: ResolveProblem = {
      ...base,
      kind: 'uncredited',
      amount: 40,
      statementId: 's1',
      row: row(),
    };
    expect(outcomesFor(p)).toEqual({
      outcomes: ['pay', 'notPaying', 'paid', 'notOwed'],
      preselected: 'paid',
      tellWhy: true,
      noStatement: false,
    });
  });

  it('still offers sending the proof without a Statement, but says it cannot go yet', () => {
    const p: ResolveProblem = { ...base, kind: 'uncredited', amount: 40, row: row() };
    expect(outcomesFor(p)).toMatchObject({ preselected: 'paid', noStatement: true });
  });

  it('preselects disputing a figure the book bills higher, and paying one it bills lower', () => {
    const higher: ResolveProblem = { ...base, kind: 'figure', row: row(), bookAsksMore: true };
    expect(outcomesFor(higher)).toMatchObject({
      outcomes: ['pay', 'notPaying', 'notOwed'],
      preselected: 'notOwed',
    });
    const lower: ResolveProblem = { ...base, kind: 'figure', row: row(), bookAsksMore: false };
    expect(outcomesFor(lower).preselected).toBe('pay');
  });

  it('offers fixing your own records first on a Conflict, and no paying: nothing is billed yet', () => {
    const p: ResolveProblem = { ...base, kind: 'conflict', row: row() };
    expect(outcomesFor(p)).toMatchObject({
      outcomes: ['fixRecords', 'notPaying', 'notOwed'],
      preselected: 'fixRecords',
    });
  });

  // The server refuses a second dispute of a day an officer answered: only the member's own
  // hide is left, and paying. A rejected declaration may be declared again.
  it('after an officer kept the bill, offers paying, hiding, and proof again only for a declaration', () => {
    const dispute: ResolveProblem = {
      ...base,
      kind: 'kept',
      row: row(),
      by: 'dispute',
      nextStep: 'Pay it',
    };
    expect(outcomesFor(dispute)).toMatchObject({
      outcomes: ['pay', 'notPaying'],
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

  it('cannot tell the corporation why on a day with no book record to name', () => {
    const p: ResolveProblem = { ...base, kind: 'uncredited', amount: 40, statementId: 's1' };
    expect(outcomesFor(p)).toMatchObject({
      outcomes: ['pay', 'notPaying', 'paid'],
      tellWhy: false,
    });
  });
});
