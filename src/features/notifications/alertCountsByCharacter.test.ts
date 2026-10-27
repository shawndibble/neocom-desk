import { describe, it, expect } from 'vitest';
import type { NotificationFeedRecord } from '@/db';
import { alertCountsByCharacter } from './alertCountsByCharacter';

function entry(id: string, characterId: number): NotificationFeedRecord {
  return { id, characterId, eventId: 'newMail', title: '', body: '', firedAt: 0 };
}

describe('alertCountsByCharacter', () => {
  it('is empty for no entries', () => {
    expect(alertCountsByCharacter([])).toEqual(new Map());
  });

  it('counts entries per character, leaving untouched characters absent', () => {
    const counts = alertCountsByCharacter([entry('a', 91), entry('b', 91), entry('c', 92)]);

    expect(counts.get(91)).toBe(2);
    expect(counts.get(92)).toBe(1);
    expect(counts.has(93)).toBe(false);
  });
});
