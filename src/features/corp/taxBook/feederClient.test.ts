import { describe, expect, it } from 'vitest';
import { inviteLink, parseInviteInput } from './feederClient';

describe('parseInviteInput', () => {
  it('takes a bare code', () => {
    expect(parseInviteInput('  abc123_DEF-456  ')).toBe('abc123_DEF-456');
  });
  it('takes the code out of a pasted link', () => {
    const link = inviteLink('https://neocomdesk.com', 'abc123_DEF-456');
    expect(parseInviteInput(link)).toBe('abc123_DEF-456');
  });
  it('refuses empty, short or link-without-code input', () => {
    expect(parseInviteInput('')).toBeNull();
    expect(parseInviteInput('abc')).toBeNull();
    expect(parseInviteInput('https://neocomdesk.com/corp/moons')).toBeNull();
    expect(parseInviteInput('not a code!')).toBeNull();
  });
});
