import { describe, expect, it } from 'vitest';
import { composeLateNoticeMail, type LateNoticeMailInput } from './lateNoticeMail';

function notice(patch: Partial<LateNoticeMailInput> = {}): LateNoticeMailInput {
  return {
    kind: 'notice',
    corporationName: 'Ore & Glory',
    recipientName: 'Varro Kestane',
    code: 'MT-4F2K',
    amountDue: 24_000_000,
    oldest: '2026-09-01',
    days: [
      { date: '2026-09-04', place: 'Efa VII - Moon 2', tax: 4_000_000 },
      { date: '2026-09-01', place: 'Efa VII - Moon 1', tax: 20_000_000 },
    ],
    verifyUrl: 'https://neocom-desk.app/corp-tax-book/verify/abc',
    ...patch,
  };
}

describe('composeLateNoticeMail', () => {
  it('names the wallet division the book reads donations from (#6204)', () => {
    const { body } = composeLateNoticeMail(notice({ accounts: ['Master Wallet', 'MOON TAXES'] }));
    expect(body).toContain('Donate to Ore &amp; Glory (Account: Master Wallet or MOON TAXES)');
  });

  it('rejects an empty corporation name instead of mailing a blank one', () => {
    expect(() => composeLateNoticeMail(notice({ corporationName: '' }))).toThrow(
      /corporation name/
    );
    expect(() => composeLateNoticeMail(notice({ corporationName: '  ' }))).toThrow(
      /corporation name/
    );
  });

  it('escapes markup in names', () => {
    const { body } = composeLateNoticeMail(notice({ recipientName: '<b>Varro</b>' }));
    expect(body).toContain('&lt;b&gt;Varro&lt;/b&gt;');
  });

  it('lists every unpaid day oldest first with its moon and tax, then the total owed now', () => {
    const { subject, body, detail } = composeLateNoticeMail(notice());
    expect(detail).toBe('lines');
    expect(subject).toBe('Ore & Glory moon tax: late notice');
    expect(body).toContain('your Ore &amp; Glory moon tax is behind');
    expect(body).toContain('Date · Moon · Tax still owed');
    const first = body.indexOf('2026-09-01 · Efa VII - Moon 1 · 20,000,000');
    const second = body.indexOf('2026-09-04 · Efa VII - Moon 2 · 4,000,000');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(body).toContain('You owe 24,000,000 ISK for 2 days, the oldest 2026-09-01.');
    expect(body).not.toMatch(/Amount due|Mined value|Statement/);
  });

  it('gives the Reason code to put on the payment, and the link with the live total', () => {
    const { body } = composeLateNoticeMail(notice());
    expect(body).toContain('put MT-4F2K in the reason');
    expect(body).toContain('<a href="https://neocom-desk.app/corp-tax-book/verify/abc">');
  });

  it('marks a reminder in the subject', () => {
    expect(composeLateNoticeMail(notice({ kind: 'reminder' })).subject).toBe(
      'Reminder: Ore & Glory moon tax: late notice'
    );
  });

  it('sums each day past the mail cap, never cutting the total, code or link', () => {
    const days = Array.from({ length: 400 }, (_, i) => ({
      date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      place: `A rather long moon name that goes on ${i % 3}`,
      tax: 1_000_000,
    }));
    const { body, detail } = composeLateNoticeMail(
      notice({ amountDue: 400_000_000, oldest: days[0].date, days })
    );
    expect(detail).not.toBe('lines');
    expect(body.length).toBeLessThanOrEqual(10_000);
    expect(body).toContain('You owe 400,000,000 ISK');
    expect(body).toContain('MT-4F2K');
  });
});
