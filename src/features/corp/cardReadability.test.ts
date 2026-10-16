import { describe, expect, it } from 'vitest';
import { unreadableCardKinds } from './cardReadability';

describe('unreadableCardKinds', () => {
  it('treats [] as read-and-empty, and null as unreadable', () => {
    expect([...unreadableCardKinds({ structures: [], extractions: [], jobs: [] })]).toEqual([]);
    expect(
      [...unreadableCardKinds({ structures: null, extractions: [], jobs: null })].sort()
    ).toEqual(['jobDelivery', 'structureFuel', 'structureTimer']);
  });

  it('marks every kind when there is no snapshot at all', () => {
    expect(unreadableCardKinds(null).size).toBe(4);
  });
});
