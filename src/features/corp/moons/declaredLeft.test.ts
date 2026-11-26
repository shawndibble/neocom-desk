import { describe, expect, it } from 'vitest';
import type { Declaration } from '@/engine/corpTaxBook/overdue';
import { declaredLeft } from './declaredLeft';

const tr = (journalRef: number, amount: number) => ({
  amount,
  at: '2026-11-10T12:00:00Z',
  journalRef,
  recipient: 'corporation' as const,
});
const base = {
  id: 'x',
  noticeId: 's',
  kind: 'another-way',
  at: '2026-11-10T00:00:00Z',
} as const;

describe('declaredLeft', () => {
  it('leaves out transfers the check found, which are already credited', () => {
    const d: Declaration = {
      ...base,
      amount: 30,
      transfers: [tr(1, 10), tr(2, 20)],
      checks: [{ result: 'found' }, { result: 'notFound' }],
    };
    expect(declaredLeft(d)).toBe(20);
  });

  it('is the declared amount without transfers and checks, and undefined when all were found', () => {
    expect(declaredLeft({ ...base, amount: 5 })).toBe(5);
    expect(declaredLeft({})).toBeUndefined();
    expect(
      declaredLeft({ ...base, amount: 10, transfers: [tr(1, 10)], checks: [{ result: 'found' }] })
    ).toBeUndefined();
  });
});
