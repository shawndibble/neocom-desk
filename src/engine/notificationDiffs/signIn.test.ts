import { describe, expect, it } from 'vitest';
import { diffCharacterNeedsLogin, type SignInSnapshot } from './signIn';

const marked = (nowMs: number): SignInSnapshot => ({ entries: [{ needsLogin: true }], nowMs });
const clear = (nowMs: number): SignInSnapshot => ({ entries: [], nowMs });

describe('diffCharacterNeedsLogin', () => {
  it('fires once when the mark appears', () => {
    expect(diffCharacterNeedsLogin(7, clear(1), marked(2))).toEqual([
      { eventId: 'characterNeedsLogin', characterId: 7, sinceMs: 2 },
    ]);
  });

  it('fires with no baseline: a dead login is current state, not history', () => {
    expect(diffCharacterNeedsLogin(7, undefined, marked(5))).toHaveLength(1);
  });

  it('does not repeat on later polls while the mark stays', () => {
    expect(diffCharacterNeedsLogin(7, marked(1), marked(2))).toEqual([]);
  });

  it('fires nothing when the mark clears or was never set', () => {
    expect(diffCharacterNeedsLogin(7, marked(1), clear(2))).toEqual([]);
    expect(diffCharacterNeedsLogin(7, undefined, clear(2))).toEqual([]);
  });

  it('fires again for a new failure after a sign-in cleared the last one', () => {
    expect(diffCharacterNeedsLogin(7, clear(3), marked(4))).toEqual([
      { eventId: 'characterNeedsLogin', characterId: 7, sinceMs: 4 },
    ]);
  });
});
