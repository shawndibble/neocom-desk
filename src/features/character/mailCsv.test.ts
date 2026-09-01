import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { MailHeader } from '@/esi/endpoints';
import { mailCsvColumns } from './mailCsv';

const t = (k: string) => k;
const nameFor = (id: number) => `Sender ${id}`;

function header(overrides: Partial<MailHeader> = {}): MailHeader {
  return {
    mail_id: 1,
    from: 100,
    subject: 'Ready to trade?',
    timestamp: '2026-08-29T12:00:00Z',
    is_read: true,
    ...overrides,
  };
}

describe('mailCsvColumns', () => {
  it('orders columns date, sender, subject, read', () => {
    const columns = mailCsvColumns(t, nameFor);
    expect(columns.map((c) => c.header)).toEqual([
      'mail.csvDate',
      'mail.csvSender',
      'mail.csvSubject',
      'mail.csvRead',
    ]);
  });

  it('resolves the sender via nameFor, or unknownSender when from is absent', () => {
    const columns = mailCsvColumns(t, nameFor);
    const senderColumn = columns.find((c) => c.header === 'mail.csvSender')!;
    expect(senderColumn.value(header({ from: 555 }))).toBe('Sender 555');
    expect(senderColumn.value(header({ from: undefined }))).toBe('mail.unknownSender');
  });

  it('falls back to noSubject for a blank subject', () => {
    const columns = mailCsvColumns(t, nameFor);
    const subjectColumn = columns.find((c) => c.header === 'mail.csvSubject')!;
    expect(subjectColumn.value(header({ subject: '' }))).toBe('mail.noSubject');
  });

  it('routes read status through csvReadYes / csvReadNo', () => {
    const columns = mailCsvColumns(t, nameFor);
    const readColumn = columns.find((c) => c.header === 'mail.csvRead')!;
    expect(readColumn.value(header({ is_read: true }))).toBe('mail.csvReadYes');
    expect(readColumn.value(header({ is_read: false }))).toBe('mail.csvReadNo');
  });

  it('emits a blank date cell when timestamp is absent', () => {
    const columns = mailCsvColumns(t, nameFor);
    const row = header({ timestamp: undefined });
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[0]).toBe('');
  });
});
