import { describe, expect, it } from 'vitest';
import { journalPlayerId } from './journalPlayer';

const isCharacter = (id: number) => id < 1000;

describe('journalPlayerId', () => {
  it('picks the first party when it is a character', () => {
    expect(journalPlayerId({ first_party_id: 5, second_party_id: 9999 }, isCharacter)).toBe(5);
  });

  it('picks the second party when only it is a character', () => {
    expect(journalPlayerId({ first_party_id: 9999, second_party_id: 7 }, isCharacter)).toBe(7);
  });

  it('is undefined when no party is a character', () => {
    expect(journalPlayerId({ first_party_id: 9999, second_party_id: 8888 }, isCharacter)).toBe(
      undefined
    );
  });

  it('is undefined when ESI sent no parties', () => {
    expect(journalPlayerId({}, isCharacter)).toBe(undefined);
  });
});
