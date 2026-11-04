import { describe, expect, it } from 'vitest';
import { quoteMailBody } from './mail';
import { trailingQuoteStart } from './quotedText';

describe('trailingQuoteStart', () => {
  it('finds the dashed rule of a quote our Reply wrote', () => {
    const body = `Sounds good.${quoteMailBody('Mero', '10/25/2026, 6:36 PM', 'Thanks.\n\nSee you')}`;
    const lines = body.split('\n');
    expect(lines[trailingQuoteStart(lines)!]).toBe('-'.repeat(32));
  });

  it('ignores a dashed rule with no From line under it', () => {
    expect(trailingQuoteStart(['intro', '--------------------------------', 'text'])).toBeNull();
  });

  it('folds from the rule when an older quote still uses ">" below it', () => {
    const lines = ['Hi', '', '-'.repeat(32), 'From: A', 'Sent: x', '', '> old'];
    expect(trailingQuoteStart(lines)).toBe(2);
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
