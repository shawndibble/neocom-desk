import { describe, it, expect, beforeEach } from 'vitest';
import { useNeedsLogin } from '@/stores/authFailure';
import { signInDomain } from './signIn';

beforeEach(() => {
  useNeedsLogin.setState({ value: [7], hydrated: true });
});

describe('signInDomain', () => {
  it('reads the needs-login mark for the character polled', async () => {
    expect(await signInDomain.load(7)).toEqual([{ needsLogin: true }]);
    expect(await signInDomain.load(8)).toEqual([]);
  });

  it('alerts once per failure, not on each later poll', async () => {
    const enabled = new Set(signInDomain.eventIds);
    const first = signInDomain.toSnapshot((await signInDomain.load(7)) ?? [], 1);
    const second = signInDomain.toSnapshot((await signInDomain.load(7)) ?? [], 2);
    expect(signInDomain.diff(7, undefined, first, enabled)).toHaveLength(1);
    expect(signInDomain.diff(7, first, second, enabled)).toEqual([]);
  });

  it('words the alert with the character and points at Characters', async () => {
    const copy = await signInDomain.render(
      { eventId: 'characterNeedsLogin', characterId: 7, sinceMs: 1 },
      'Ada Vance'
    );
    expect(copy).toEqual({
      title: 'Log in again',
      body: 'Ada Vance needs to log in again. Its alerts have stopped.',
    });
  });
});
