import { describe, expect, it } from 'vitest';
import { EVE_MARKUP_LIMIT } from '../mail/eveMarkup';
import { MAX_SUBJECT_LENGTH } from '../mail/mailCompose';
import {
  PREVIEW_VERIFY_TOKEN,
  checkEditedMail,
  composeLateNoticeMail,
  editedMailBlocked,
  editedMailLength,
  fillVerifyLink,
  previewVerifyUrl,
  verifyUrl,
  type LateNoticeMailInput,
} from './lateNoticeMail';
import { VERIFY_TOKEN_LENGTH } from './verifyToken';

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

describe('an edited preview mail (fillVerifyLink, editedMailLength, checkEditedMail)', () => {
  const origin = 'https://app.test';
  const preview = previewVerifyUrl(origin);
  const real = verifyUrl(origin, 'tok123');

  it('builds the preview link and the real one on one route', () => {
    expect(preview).toBe(`https://app.test/corp-tax-book/verify/${PREVIEW_VERIFY_TOKEN}`);
    expect(real).toBe('https://app.test/corp-tax-book/verify/tok123');
  });

  it('swaps every copy of the preview link, the href and its text', () => {
    const { body } = composeLateNoticeMail(notice({ verifyUrl: preview }));
    const filled = fillVerifyLink(`Edited intro\n${body}`, origin, real);
    expect(filled).not.toContain(PREVIEW_VERIFY_TOKEN);
    expect(filled).toContain(`<a href="${real}">${real}</a>`);
    expect(filled.startsWith('Edited intro\n')).toBe(true);
  });

  it('swaps a percent-encoded copy too, as an editor may write the href', () => {
    const filled = fillVerifyLink(`<a href="${encodeURI(preview)}">here</a>`, origin, real);
    expect(filled).toBe(`<a href="${real}">here</a>`);
  });

  it('leaves a body the officer took the link out of as it is', () => {
    expect(fillVerifyLink('Pay up.', origin, real)).toBe('Pay up.');
  });

  it('counts an edited body as it will be sent, with the real token in place of the preview one', () => {
    const body = `Pay: <a href="${preview}">${preview}</a>`;
    const grow = VERIFY_TOKEN_LENGTH - PREVIEW_VERIFY_TOKEN.length;
    expect(editedMailLength(body, origin)).toBe(body.length + 2 * grow);
    expect(editedMailLength('Pay up.', origin)).toBe(7);
  });

  it('passes a mail with a subject, a message and the link', () => {
    const { subject, body } = composeLateNoticeMail(notice({ verifyUrl: preview }));
    expect(checkEditedMail({ subject, body }, origin)).toEqual([]);
  });

  it('needs a subject and a message, markup alone being no message', () => {
    expect(checkEditedMail({ subject: ' ', body: `<b> </b>${preview}` }, origin)).toEqual([
      'empty',
    ]);
    expect(checkEditedMail({ subject: 'Late', body: '<b></b>\n' }, origin)).toEqual([
      'empty',
      'noLink',
    ]);
  });

  it('flags a subject or body over EVE’s limits, the body counted with the real link', () => {
    const subject = 'x'.repeat(MAX_SUBJECT_LENGTH + 1);
    expect(checkEditedMail({ subject, body: preview }, origin)).toEqual(['subjectTooLong']);
    const fits = 'x'.repeat(EVE_MARKUP_LIMIT - preview.length) + preview;
    expect(checkEditedMail({ subject: 'Late', body: fits }, origin)).toEqual(['bodyTooLong']);
  });

  it('warns, without blocking, when the link was taken out', () => {
    expect(checkEditedMail({ subject: 'Late', body: 'Pay up.' }, origin)).toEqual(['noLink']);
    expect(editedMailBlocked(['noLink'])).toBe(false);
    expect(editedMailBlocked(['noLink', 'empty'])).toBe(true);
  });
});
