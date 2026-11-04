import { describe, expect, it } from 'vitest';
import { quoteMailBody } from './mail';
import { trailingQuoteStart } from './quotedText';

describe('trailingQuoteStart', () => {
  it('finds where the attribution of a quote our Reply wrote begins', () => {
    const body = `Sounds good.${quoteMailBody('Mero', '10/25/2026, 6:36 PM', 'Thanks.\n\nSee you')}`;
    const lines = body.split('\n');
    expect(lines[trailingQuoteStart(lines)!]).toBe('On 10/25/2026, 6:36 PM, Mero wrote:');
  });

  it('starts at the first > line when nothing introduces it', () => {
    expect(trailingQuoteStart(['hi', '', '> old', '> older'])).toBe(2);
  });

  it('takes nested attributions and blank quoted lines as part of the same tail', () => {
    const lines = [
      'Reply',
      '',
      'On Tue, B wrote:',
      '> mid',
      '>',
      '> On Mon, A wrote:',
      '> > first',
    ];
    expect(trailingQuoteStart(lines)).toBe(2);
  });

  it('is null when nothing is quoted, or the quote is followed by new writing', () => {
    expect(trailingQuoteStart(['just text', 'more'])).toBeNull();
    expect(trailingQuoteStart(['> quoted', 'then my answer'])).toBeNull();
  });

  it('does not take an attribution with no quote after it', () => {
    expect(trailingQuoteStart(['hello', 'On Tue, B wrote:'])).toBeNull();
  });

  it('reads the escaped marker the editor keeps in markup', () => {
    expect(trailingQuoteStart(['mine', '&gt; old'], ['&gt;'])).toBe(1);
  });
});
