import { describe, expect, it } from 'vitest';
import { parseChatLink } from '@/engine/import/chatLink';

describe('parseChatLink', () => {
  it('reads an item or ship type link', () => {
    expect(parseChatLink('<url=showinfo:587>Rifter</url>')).toEqual({ kind: 'type', id: 587 });
  });

  it('reads the bare text form', () => {
    expect(parseChatLink('showinfo:34')).toEqual({ kind: 'type', id: 34 });
  });

  it('reads a solar system link', () => {
    expect(parseChatLink('<url=showinfo:5//30000142>Jita</url>')).toEqual({
      kind: 'system',
      id: 30000142,
    });
  });

  it('opens the first recognised link only', () => {
    expect(
      parseChatLink('<url=showinfo:5//30000142>Jita</url> <url=showinfo:587>Rifter</url>')
    ).toEqual({ kind: 'system', id: 30000142 });
  });

  it('skips unsupported kinds to reach a recognised one', () => {
    expect(
      parseChatLink('<url=showinfo:2//98000001>Corp</url> <url=showinfo:587>Rifter</url>')
    ).toEqual({ kind: 'type', id: 587 });
  });

  it('ignores corporations, characters and other instance links', () => {
    expect(parseChatLink('<url=showinfo:2//98000001>Corp</url>')).toBeNull();
    expect(parseChatLink('<url=showinfo:1377//90000001>Pilot</url>')).toBeNull();
    expect(parseChatLink('<url=showinfo:587//1000000000001>My Rifter</url>')).toBeNull();
  });

  it('ignores malformed links', () => {
    expect(parseChatLink('showinfo:')).toBeNull();
    expect(parseChatLink('showinfo:abc')).toBeNull();
    expect(parseChatLink('showinfo:0')).toBeNull();
    expect(parseChatLink('showinfo:5//')).toBeNull();
    expect(parseChatLink('showinfo:5//0')).toBeNull();
    expect(parseChatLink('showinfo:587//abc')).toBeNull();
    expect(parseChatLink('showinfo:99999999999999999999')).toBeNull();
    expect(parseChatLink('just some chat')).toBeNull();
  });
});
