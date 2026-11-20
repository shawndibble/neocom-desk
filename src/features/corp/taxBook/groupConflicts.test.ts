import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn() }));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: vi.fn() }));

import { groupConflictsFrom } from './bookClient';

describe('groupConflictsFrom', () => {
  it('reads the conflicts and drops malformed ones', () => {
    expect(
      groupConflictsFrom({
        items: [
          { characterId: 6, minerIds: ['a', 'b'], at: '2026-11-19T10:00:00Z' },
          { characterId: 'x', minerIds: ['a'] },
          null,
          { characterId: 7, minerIds: 'nope' },
        ],
      })
    ).toEqual([{ characterId: 6, minerIds: ['a', 'b'], at: '2026-11-19T10:00:00Z' }]);
  });
  it('is empty for no doc', () => {
    expect(groupConflictsFrom(undefined)).toEqual([]);
  });
});
