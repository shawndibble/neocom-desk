import { describe, expect, it } from 'vitest';
import { EVE_MARKUP_LIMIT, markupPlainText, parseEveMarkup } from '../mail/eveMarkup';
import { composeTaxQuestionMail, type TaxQuestionMailInput } from './taxQuestionMail';

const base: TaxQuestionMailInput = {
  kind: 'paid',
  memberName: 'Ada Miner',
  corpName: 'Buhrmann Mining',
  days: '2026-11-02',
  amountIsk: 12_500_000,
  note: 'Sent it from my alt.',
};

const plain = (body: string) => markupPlainText(parseEveMarkup(body));

describe('composeTaxQuestionMail', () => {
  it('says a member paid, with the figures, transfers, note and where it waits', () => {
    const { subject, body } = composeTaxQuestionMail({
      ...base,
      transfers: [{ amountIsk: 12_500_000, at: '2026-11-03 10:00', journalRef: 987654 }],
    });
    expect(subject).toContain('Ada Miner');
    const text = plain(body);
    expect(text).toContain('Ada Miner');
    expect(text).toContain('Buhrmann Mining');
    expect(text).toContain('says they paid');
    expect(text).toContain('2026-11-02');
    expect(text).toContain('12,500,000');
    expect(text).toContain('987654');
    expect(text).toContain('Sent it from my alt.');
    expect(text).toContain('Needs you');
    expect(text).toContain('Neocom Desk');
  });

  it('says plainly what a dispute and a refusal are', () => {
    expect(plain(composeTaxQuestionMail({ ...base, kind: 'notOwed' }).body)).toContain(
      'says they do not owe'
    );
    expect(plain(composeTaxQuestionMail({ ...base, kind: 'notPaying' }).body)).toContain(
      'says they will not pay'
    );
  });

  it('leaves the note line out when empty', () => {
    expect(plain(composeTaxQuestionMail({ ...base, note: '  ' }).body)).not.toContain('They wrote');
  });

  it('keeps markup characters in names and notes out of the mail', () => {
    const { subject, body } = composeTaxQuestionMail({
      ...base,
      memberName: 'A<b>da',
      note: '<a href="x">hi</a>',
    });
    expect(subject).not.toMatch(/[<>]/);
    expect(plain(body)).not.toMatch(/[<>]/);
  });

  it('keeps the subject within the field and the body within the game limit', () => {
    const out = composeTaxQuestionMail({
      ...base,
      memberName: 'M'.repeat(300),
      note: 'n'.repeat(20_000),
      transfers: Array.from({ length: 200 }, (_, i) => ({
        amountIsk: 1,
        at: '2026-11-03 10:00',
        journalRef: i,
      })),
    });
    expect(Array.from(out.subject).length).toBeLessThanOrEqual(100);
    expect(out.body.length).toBeLessThanOrEqual(EVE_MARKUP_LIMIT);
  });
});
