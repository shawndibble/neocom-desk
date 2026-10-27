import { describe, expect, it } from 'vitest';
import { ORDER_PROBLEMS } from '@/engine/market/orderProblems';
import { openOrderRow } from './__fixtures__/openOrderRow';
import { orderUrgency, rowInView, viewForProblems } from './orderUrgency';

const row = (problem: (typeof ORDER_PROBLEMS)[number], extra = {}) =>
  openOrderRow({ problem, problems: [problem], ...extra });

describe('orderUrgency', () => {
  it('files the four problems the pilot must fix under Needs you', () => {
    for (const problem of ['belowFloor', 'undercutStation', 'outbid', 'expiringOrStale'] as const) {
      expect(orderUrgency(row(problem))).toBe('act');
    }
  });

  it('files system and region undercuts under Watch', () => {
    expect(orderUrgency(row('undercutSystem'))).toBe('watch');
    expect(orderUrgency(row('undercutRegion'))).toBe('watch');
  });

  it('files an order nobody could check under Watch, never Fine', () => {
    expect(orderUrgency(row('healthy', { competitionUnchecked: true }))).toBe('watch');
  });

  it('files a healthy order under Fine, often undercut or not', () => {
    expect(orderUrgency(row('healthy'))).toBe('fine');
    expect(orderUrgency(row('healthy', { frequentlyUndercut: true }))).toBe('fine');
  });
});

describe('rowInView', () => {
  it('shows a row in its own view and in All only', () => {
    const watch = row('undercutRegion');
    expect(rowInView(watch, 'watch')).toBe(true);
    expect(rowInView(watch, 'all')).toBe(true);
    expect(rowInView(watch, 'act')).toBe(false);
    expect(rowInView(row('healthy'), 'act')).toBe(false);
    expect(rowInView(row('healthy'), 'watch')).toBe(false);
  });
});

describe('viewForProblems', () => {
  it('stays on Needs you when every named problem is one', () => {
    expect(viewForProblems([])).toBe('act');
    expect(viewForProblems(['belowFloor', 'outbid'])).toBe('act');
  });

  it('opens Watch when only Watch problems are named', () => {
    expect(viewForProblems(['undercutSystem', 'undercutRegion'])).toBe('watch');
  });

  it('opens All for a mix', () => {
    expect(viewForProblems(['undercutStation', 'undercutRegion'])).toBe('all');
  });
});
