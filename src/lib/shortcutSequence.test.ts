import { describe, expect, it } from 'vitest';
import { advanceSequence, IDLE, SEQUENCE_TIMEOUT_MS } from './shortcutSequence';

const isSecond = (key: string) => 'omc'.includes(key);

describe('advanceSequence', () => {
  it('waits after the prefix key', () => {
    expect(advanceSequence(IDLE, 'g', 100, isSecond)).toEqual({
      kind: 'pending',
      state: { pendingSince: 100 },
    });
  });

  it('matches a known second key inside the window and goes idle', () => {
    const result = advanceSequence({ pendingSince: 100 }, 'o', 100 + SEQUENCE_TIMEOUT_MS, isSecond);
    expect(result).toEqual({ kind: 'match', key: 'o', state: IDLE });
  });

  it('treats a second key after the window as an ordinary key', () => {
    const result = advanceSequence({ pendingSince: 100 }, 'o', 101 + SEQUENCE_TIMEOUT_MS, isSecond);
    expect(result).toEqual({ kind: 'ignore', state: IDLE });
  });

  it('starts a fresh sequence when the prefix comes after the window', () => {
    expect(advanceSequence({ pendingSince: 100 }, 'g', 5000, isSecond)).toEqual({
      kind: 'pending',
      state: { pendingSince: 5000 },
    });
  });

  it('cancels on any other key', () => {
    expect(advanceSequence({ pendingSince: 100 }, 'x', 200, isSecond)).toEqual({
      kind: 'ignore',
      state: IDLE,
    });
    expect(advanceSequence({ pendingSince: 100 }, 'escape', 200, isSecond)).toEqual({
      kind: 'ignore',
      state: IDLE,
    });
  });

  it('restarts the window when the prefix repeats', () => {
    expect(advanceSequence({ pendingSince: 100 }, 'g', 200, isSecond)).toEqual({
      kind: 'pending',
      state: { pendingSince: 200 },
    });
  });

  it('ignores a second key with nothing pending', () => {
    expect(advanceSequence(IDLE, 'o', 100, isSecond)).toEqual({ kind: 'ignore', state: IDLE });
  });
});
