import { describe, it, expect } from 'vitest';
import { linkifyText } from './linkifyText';

describe('linkifyText', () => {
  it('returns one text part when there is no link', () => {
    expect(linkifyText('Just a note.')).toEqual([{ kind: 'text', text: 'Just a note.' }]);
  });

  it('splits an http(s) link out of prose', () => {
    expect(linkifyText('Join:\nhttps://a.example/x?y=1 now')).toEqual([
      { kind: 'text', text: 'Join:\n' },
      { kind: 'link', href: 'https://a.example/x?y=1' },
      { kind: 'text', text: ' now' },
    ]);
  });

  it('leaves trailing punctuation outside the link', () => {
    expect(linkifyText('See (http://a.example/p).')).toEqual([
      { kind: 'text', text: 'See (' },
      { kind: 'link', href: 'http://a.example/p' },
      { kind: 'text', text: ').' },
    ]);
  });

  it('ignores other schemes', () => {
    expect(linkifyText('javascript:alert(1) ftp://x.example')).toEqual([
      { kind: 'text', text: 'javascript:alert(1) ftp://x.example' },
    ]);
  });

  it('finds several links', () => {
    const parts = linkifyText('https://a.example https://b.example');
    expect(parts.filter((p) => p.kind === 'link')).toHaveLength(2);
  });
});
