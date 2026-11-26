import { beforeEach, describe, expect, it } from 'vitest';
import { slotFor, useReauthSlots } from './reauthSlots';

const KESTREL = 1;
const MIRA = 2;

const speaker = (key: string) => slotFor(useReauthSlots.getState().slots, key);

describe('reauthSlots', () => {
  beforeEach(() => useReauthSlots.setState({ slots: [] }));

  it('lets the first banner for a Character speak, asking for every endpoint its page needs', () => {
    const { claim } = useReauthSlots.getState();
    claim('a', KESTREL, 'banner', ['getCharacterWallet']);
    claim('b', KESTREL, 'banner', ['getCharacterAssets', 'getCharacterWallet']);
    claim('c', MIRA, 'banner', ['getCharacterSkills']);
    expect(speaker('a')).toEqual({
      primary: true,
      endpoints: ['getCharacterWallet', 'getCharacterAssets'],
      shared: true,
    });
    expect(speaker('b')).toEqual({ primary: false, endpoints: [], shared: false });
    expect(speaker('c')).toEqual({
      primary: true,
      endpoints: ['getCharacterSkills'],
      shared: false,
    });
  });

  it('lets the weightiest banner speak, so a one-line note never stands in for a blocked view', () => {
    const { claim } = useReauthSlots.getState();
    claim('note', KESTREL, 'note', ['getCharacterWallet']);
    claim('banner', KESTREL, 'banner', ['getCharacterSkills']);
    expect(speaker('note').primary).toBe(false);
    expect(speaker('banner')).toEqual({
      primary: true,
      endpoints: ['getCharacterWallet', 'getCharacterSkills'],
      shared: true,
    });
    claim('page', KESTREL, 'page', ['getCharacterMail']);
    expect(speaker('page').primary).toBe(true);
    expect(speaker('banner').primary).toBe(false);
  });

  it('keeps a banner its turn when its endpoints change', () => {
    const { claim } = useReauthSlots.getState();
    claim('a', KESTREL, 'banner', ['getCharacterWallet']);
    claim('b', KESTREL, 'banner', ['getCharacterAssets']);
    claim('a', KESTREL, 'banner', ['getCharacterSkills']);
    expect(speaker('a')).toEqual({
      primary: true,
      endpoints: ['getCharacterSkills', 'getCharacterAssets'],
      shared: true,
    });
  });

  it('hands the slot on when the speaking banner goes', () => {
    const { claim, release } = useReauthSlots.getState();
    claim('a', KESTREL, 'banner', ['getCharacterWallet']);
    claim('b', KESTREL, 'banner', ['getCharacterAssets']);
    release('a');
    expect(speaker('b')).toEqual({
      primary: true,
      endpoints: ['getCharacterAssets'],
      shared: false,
    });
  });
});
