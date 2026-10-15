import { describe, expect, it } from 'vitest';
import { MAX_MAIL_SUBJECT, clipToCodePoints, itemsSummary, mailSubject } from './requestMail';

describe('request mail text', () => {
  it('summarises the lines as first name plus how many more', () => {
    const more = (n: number) => `+ ${n} more`;
    expect(itemsSummary(['A'], more)).toBe('A');
    expect(itemsSummary(['A', 'B', 'C'], more)).toBe('A + 2 more');
    expect(itemsSummary([], more)).toBe('');
  });

  it('clips by code points, never through a surrogate pair', () => {
    const text = '😀'.repeat(MAX_MAIL_SUBJECT + 5);
    const clipped = mailSubject(text);
    expect(Array.from(clipped)).toHaveLength(MAX_MAIL_SUBJECT);
    expect(clipped).toBe('😀'.repeat(MAX_MAIL_SUBJECT));
    expect(clipToCodePoints('abc', 5)).toBe('abc');
    expect(clipToCodePoints('a😀b', 2)).toBe('a😀');
  });

  it('cleans and clips the subject together', () => {
    expect(mailSubject(`<b>${'x'.repeat(200)}`)).toHaveLength(MAX_MAIL_SUBJECT);
    expect(mailSubject('<b>hi')).toBe('bhi');
  });
});
