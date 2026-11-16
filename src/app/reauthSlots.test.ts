import { beforeEach, describe, expect, it } from 'vitest';
import { slotFor, useReauthSlots } from './reauthSlots';

const KESTREL = 1;
const MIRA = 2;

describe('reauthSlots', () => {
  beforeEach(() => useReauthSlots.setState({ slots: [] }));

  it('lets the first banner for a Character speak, asking for every endpoint its page needs', () => {
    const { claim } = useReauthSlots.getState();
    claim('a', KESTREL, ['getCharacterWallet']);
    claim('b', KESTREL, ['getCharacterAssets', 'getCharacterWallet']);
    claim('c', MIRA, ['getCharacterSkills']);
    const { slots } = useReauthSlots.getState();
    expect(slotFor(slots, 'a')).toEqual({
      primary: true,
      endpoints: ['getCharacterWallet', 'getCharacterAssets'],
      shared: true,
    });
    expect(slotFor(slots, 'b')).toEqual({ primary: false, endpoints: [], shared: false });
    // Another Character's banner is its own.
    expect(slotFor(slots, 'c')).toEqual({
      primary: true,
      endpoints: ['getCharacterSkills'],
      shared: false,
    });
  });

  it('hands the slot on when the speaking banner goes', () => {
    const { claim, release } = useReauthSlots.getState();
    claim('a', KESTREL, ['getCharacterWallet']);
    claim('b', KESTREL, ['getCharacterAssets']);
    release('a');
    expect(slotFor(useReauthSlots.getState().slots, 'b')).toEqual({
      primary: true,
      endpoints: ['getCharacterAssets'],
      shared: false,
    });
  });

  it('says whether a page banner covers a Character, for the shell notice to stand down', () => {
    useReauthSlots.getState().claim('a', KESTREL, ['getCharacterWallet']);
    const { covers } = useReauthSlots.getState();
    expect(covers(KESTREL)).toBe(true);
    expect(covers(MIRA)).toBe(false);
  });
});
