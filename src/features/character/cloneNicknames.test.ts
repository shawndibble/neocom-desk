import { describe, it, expect } from 'vitest';
import {
  CLONE_NICKNAME_MAX,
  cloneOwnName,
  parseCloneNicknames,
  withCloneNickname,
} from './cloneNicknames';

describe('clone nicknames', () => {
  it('stores a trimmed name and drops the entry on a blank one', () => {
    const named = withCloneNickname({}, 1001, '  Jita PvE  ');
    expect(named).toEqual({ 1001: 'Jita PvE' });
    expect(withCloneNickname(named, 1001, '   ')).toEqual({});
  });

  it('caps a long name', () => {
    const named = withCloneNickname({}, 1001, 'x'.repeat(CLONE_NICKNAME_MAX + 20));
    expect(named[1001]).toHaveLength(CLONE_NICKNAME_MAX);
  });

  it('keeps usable entries and drops damaged ones', () => {
    expect(parseCloneNicknames({ 1001: 'Hauler', 1002: '', 1003: 4, x: 'Bad' })).toEqual({
      1001: 'Hauler',
    });
    expect(parseCloneNicknames('Hauler')).toEqual({});
  });

  it("prefers the pilot's nickname, then ESI's name, then nothing", () => {
    const clone = { jump_clone_id: 1001, name: ' In-game ' };
    expect(cloneOwnName(clone, { 1001: 'Mine' })).toBe('Mine');
    expect(cloneOwnName(clone, {})).toBe('In-game');
    expect(cloneOwnName({ jump_clone_id: 1001, name: '  ' }, {})).toBeUndefined();
    expect(cloneOwnName({ jump_clone_id: 1001 }, {})).toBeUndefined();
  });
});
