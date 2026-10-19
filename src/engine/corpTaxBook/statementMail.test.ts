import { describe, expect, it } from 'vitest';
import { composeStatementMail, type StatementMailInput } from './statementMail';

const names: Record<number, string> = { 1: 'Efa - Brass Anvil', 2: 'Amarr - Tower' };

function input(patch: Partial<StatementMailInput> = {}): StatementMailInput {
  return {
    kind: 'statement',
    corporationName: 'Ore & Glory',
    recipientName: 'Varro Kestane',
    periodLabel: 'Sep 2026',
    code: 'MT-4F2K',
    lines: [
      {
        kind: 'mined',
        date: '2026-09-03',
        structureId: 1,
        estimatedValue: 12_000_000,
        tax: 1_200_000,
      },
      {
        kind: 'mined',
        date: '2026-09-04',
        structureId: 2,
        estimatedValue: 8_000_000,
        tax: 800_000,
      },
    ],
    refineryName: (id) => names[id],
    amountDue: 3_500_000,
    carried: 1_500_000,
    dueDate: '2026-10-15',
    verifyUrl: 'https://neocom-desk.app/corp-tax-book/verify/abc',
    ...patch,
  };
}

describe('composeStatementMail', () => {
  it('rejects an empty corporation name instead of mailing a blank one', () => {
    expect(() => composeStatementMail(input({ corporationName: '' }))).toThrow(/corporation name/);
    expect(() => composeStatementMail(input({ corporationName: '  ' }))).toThrow(
      /corporation name/
    );
  });

  it('lists date, refinery, value and tax per line, then the total', () => {
    const { subject, body, detail } = composeStatementMail(input());
    expect(detail).toBe('lines');
    expect(subject).toBe('Ore & Glory moon tax Statement, Sep 2026');
    expect(body).toContain('2026-09-03 · Efa - Brass Anvil · 12,000,000 · 1,200,000');
    expect(body).toContain('2026-09-04 · Amarr - Tower · 8,000,000 · 800,000');
    expect(body).toContain('Total tax: 2,000,000 ISK');
  });

  it('carries amount due, due date, code and the verify link', () => {
    const { body } = composeStatementMail(input());
    expect(body).toContain(
      'Amount due 3,500,000 ISK by 2026-10-15 (includes 1,500,000 still owed).'
    );
    expect(body).toContain('Code MT-4F2K');
    expect(body).toContain('<a href="https://neocom-desk.app/corp-tax-book/verify/abc">');
  });

  it('leaves out unit prices, rates, quantities and payments credited', () => {
    const { body } = composeStatementMail(input());
    expect(body).not.toMatch(/\brate\b|unit price|quantity|payments credited/i);
  });

  it('escapes markup in names', () => {
    const { body } = composeStatementMail(input({ recipientName: '<b>x</b>' }));
    expect(body).toContain('Hi &lt;b&gt;x&lt;/b&gt;');
  });

  it('shows a correction line by its reason', () => {
    const { body } = composeStatementMail(
      input({
        lines: [
          {
            kind: 'correction',
            date: '2026-09-05',
            estimatedValue: 0,
            tax: -50_000,
            reason: 'Officer correction',
          },
        ],
      })
    );
    expect(body).toContain('2026-09-05 · Officer correction · 0 · -50,000');
  });

  it('marks a reminder', () => {
    const mail = composeStatementMail(input({ kind: 'reminder' }));
    expect(mail.subject.startsWith('Reminder: ')).toBe(true);
    expect(mail.body).toContain('a reminder of your');
  });

  it('summarises by day per refinery past 10,000 characters', () => {
    // 3 characters mining the same refinery on each of 120 days: 360 lines.
    const lines = Array.from({ length: 360 }, (_, i) => ({
      kind: 'mined' as const,
      date: `2026-${i < 180 ? '08' : '09'}-${String((i % 30) + 1).padStart(2, '0')}`,
      structureId: 1,
      estimatedValue: 1_000_000,
      tax: 100_000,
    }));
    const mail = composeStatementMail(input({ lines }));
    expect(mail.body.length).toBeLessThanOrEqual(10_000);
    expect(mail.detail).toBe('byDay');
    expect(mail.body).toContain('summarised');
    expect(mail.body).toContain('Total tax: 36,000,000 ISK');
    expect(mail.body).toContain('Code MT-4F2K');
  });

  it('falls back to one line per refinery when even days do not fit', () => {
    const lines = Array.from({ length: 3000 }, (_, i) => ({
      kind: 'mined' as const,
      date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10),
      structureId: (i % 2) + 1,
      estimatedValue: 1_000_000,
      tax: 100_000,
    }));
    const mail = composeStatementMail(input({ lines }));
    expect(mail.detail).toBe('byRefinery');
    expect(mail.body.length).toBeLessThanOrEqual(10_000);
    expect(mail.body).toContain('Total tax: 300,000,000 ISK');
    expect(mail.body).toContain('Efa - Brass Anvil');
  });
});
