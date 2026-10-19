import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: vi.fn(), getSyncFunctions: vi.fn() }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn() }));

import { groupingAnswersFrom } from './bookClient';

describe('groupingAnswersFrom', () => {
  it('reads each answer with who gave it', () => {
    expect(
      groupingAnswersFrom({
        answers: {
          '61': {
            minerId: 'm-a',
            answer: 'declined',
            at: '2026-10-18T10:00:00Z',
            via: 'verify-link',
          },
          '62': {
            minerId: 'm-a',
            answer: 'confirmed',
            at: '2026-10-18T11:00:00Z',
            via: 'character',
          },
        },
      })
    ).toEqual([
      {
        characterId: 61,
        minerId: 'm-a',
        answer: 'declined',
        at: '2026-10-18T10:00:00Z',
        via: 'verify-link',
      },
      {
        characterId: 62,
        minerId: 'm-a',
        answer: 'confirmed',
        at: '2026-10-18T11:00:00Z',
        via: 'character',
      },
    ]);
  });

  it('drops anything malformed, and a missing doc is no answers', () => {
    expect(groupingAnswersFrom(undefined)).toEqual([]);
    expect(
      groupingAnswersFrom({
        answers: { x: { answer: 'confirmed' }, '5': { answer: 'maybe' }, '6': 3 },
      })
    ).toEqual([]);
  });
});
