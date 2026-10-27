import { describe, it, expect } from 'vitest';
import { dedupeCharacterName } from './notificationBody';

describe('dedupeCharacterName', () => {
  it('returns the body unchanged when there is no name (one-Character device)', () => {
    expect(dedupeCharacterName('Mero Otichoda has new mail.', null)).toBe(
      'Mero Otichoda has new mail.'
    );
  });

  it('strips a colon-led name and capitalizes what follows', () => {
    expect(
      dedupeCharacterName(
        'Mero Otichoda: Moro Moonpull was added, starting Oct 10, 3:30 AM.',
        'Mero Otichoda'
      )
    ).toBe('Moro Moonpull was added, starting Oct 10, 3:30 AM.');
  });

  it('strips a possessive-led name', () => {
    expect(dedupeCharacterName("Mero Otichoda's contract was accepted.", 'Mero Otichoda')).toBe(
      'Contract was accepted.'
    );
  });

  it('strips a bare leading name', () => {
    expect(dedupeCharacterName('Shadow Ruler has new mail.', 'Shadow Ruler')).toBe('Has new mail.');
  });

  it('strips a trailing "from Name." (marketOrderFilled)', () => {
    expect(
      dedupeCharacterName(
        'Someone bought 2 x Festival Launcher from Mero Otichoda.',
        'Mero Otichoda'
      )
    ).toBe('Someone bought 2 x Festival Launcher.');
  });

  it('leaves a body untouched when the name appears nowhere in it', () => {
    expect(
      dedupeCharacterName('Something happened — open the app for details.', 'Mero Otichoda')
    ).toBe('Something happened — open the app for details.');
  });

  it('does not choke on a name containing regex-special characters', () => {
    expect(dedupeCharacterName('Someone bought PLEX from A.J. (Foo)', 'A.J. (Foo)')).toBe(
      'Someone bought PLEX from A.J. (Foo)'
    );
  });
});
