import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { DEFAULT_UNDERCUT_HISTORY_THRESHOLDS } from '@/engine/market/orderProblemHistory';
import {
  loadOrderProblemSamples,
  recordOrderProblemSamples,
  sampleableCharacterIds,
} from './orderProblemSamples';
import type { CharacterOpenOrders } from './openOrdersData';

const NOW = 1_700_000_000_000;
const SPACING = DEFAULT_UNDERCUT_HISTORY_THRESHOLDS.minSpacingMs;

beforeEach(async () => {
  await db.orderProblemSamples.clear();
});

describe('sampleableCharacterIds', () => {
  function entry(overrides: Partial<CharacterOpenOrders> = {}): CharacterOpenOrders {
    return {
      characterId: 10,
      characterName: 'Ryn Vashti',
      orders: [],
      fetchedAt: NOW,
      fromCache: false,
      needsReauth: false,
      ...overrides,
    };
  }

  it('includes a character whose orders were read, even when it has none open', () => {
    expect(sampleableCharacterIds([entry()])).toEqual([10]);
  });

  it('excludes a character that needs re-auth, so its history is never pruned', () => {
    expect(sampleableCharacterIds([entry({ needsReauth: true })])).toEqual([]);
  });

  it('excludes a character whose fetch returned no cache at all (offline, cold load)', () => {
    expect(sampleableCharacterIds([entry({ fetchedAt: 0 })])).toEqual([]);
  });

  it('keeps only the readable characters out of a mixed load', () => {
    expect(
      sampleableCharacterIds([
        entry({ characterId: 10 }),
        entry({ characterId: 20, needsReauth: true }),
        entry({ characterId: 30, fetchedAt: 0 }),
        entry({ characterId: 40 }),
      ])
    ).toEqual([10, 40]);
  });
});

describe('recordOrderProblemSamples', () => {
  it('stores one sample per open order', async () => {
    await recordOrderProblemSamples(
      [
        { orderId: 1, characterId: 10, problem: 'healthy' },
        { orderId: 2, characterId: 10, problem: 'undercutStation' },
      ],
      [10],
      NOW
    );
    const stored = await loadOrderProblemSamples([10]);
    expect(stored.get(1)).toEqual([{ at: NOW, problem: 'healthy' }]);
    expect(stored.get(2)).toEqual([{ at: NOW, problem: 'undercutStation' }]);
  });

  it('appends a later reading and keeps the series oldest-first', async () => {
    await recordOrderProblemSamples(
      [{ orderId: 1, characterId: 10, problem: 'healthy' }],
      [10],
      NOW
    );
    await recordOrderProblemSamples(
      [{ orderId: 1, characterId: 10, problem: 'undercutStation' }],
      [10],
      NOW + SPACING
    );
    expect((await loadOrderProblemSamples([10])).get(1)).toEqual([
      { at: NOW, problem: 'healthy' },
      { at: NOW + SPACING, problem: 'undercutStation' },
    ]);
  });

  it('drops a second reading taken inside the spacing window, so a re-render cannot inflate the rate', async () => {
    await recordOrderProblemSamples(
      [{ orderId: 1, characterId: 10, problem: 'healthy' }],
      [10],
      NOW
    );
    await recordOrderProblemSamples(
      [{ orderId: 1, characterId: 10, problem: 'undercutStation' }],
      [10],
      NOW + 1000
    );
    expect((await loadOrderProblemSamples([10])).get(1)).toEqual([{ at: NOW, problem: 'healthy' }]);
  });

  it('prunes the history of an order that is no longer open', async () => {
    await recordOrderProblemSamples(
      [
        { orderId: 1, characterId: 10, problem: 'healthy' },
        { orderId: 2, characterId: 10, problem: 'healthy' },
      ],
      [10],
      NOW
    );
    await recordOrderProblemSamples(
      [{ orderId: 1, characterId: 10, problem: 'healthy' }],
      [10],
      NOW + SPACING
    );
    const stored = await loadOrderProblemSamples([10]);
    expect(stored.has(2)).toBe(false);
    expect(stored.get(1)).toHaveLength(2);
  });

  it('never prunes a character the load did not cover — an unread character keeps its history', async () => {
    await recordOrderProblemSamples(
      [
        { orderId: 1, characterId: 10, problem: 'healthy' },
        { orderId: 2, characterId: 20, problem: 'healthy' },
      ],
      [10, 20],
      NOW
    );
    // Character 20's orders could not be read this time: it is absent from
    // both the readings and the character list.
    await recordOrderProblemSamples(
      [{ orderId: 1, characterId: 10, problem: 'healthy' }],
      [10],
      NOW + SPACING
    );
    expect((await loadOrderProblemSamples([20])).get(2)).toEqual([{ at: NOW, problem: 'healthy' }]);
  });

  it('does nothing at all when no character was loaded', async () => {
    await recordOrderProblemSamples(
      [{ orderId: 1, characterId: 10, problem: 'healthy' }],
      [10],
      NOW
    );
    await recordOrderProblemSamples([], [], NOW + SPACING);
    expect((await loadOrderProblemSamples([10])).get(1)).toEqual([{ at: NOW, problem: 'healthy' }]);
  });
});

describe('loadOrderProblemSamples', () => {
  it('returns an empty map for no characters, without touching the table', async () => {
    await recordOrderProblemSamples(
      [{ orderId: 1, characterId: 10, problem: 'healthy' }],
      [10],
      NOW
    );
    expect(await loadOrderProblemSamples([])).toEqual(new Map());
  });

  it('returns only the asked-for characters', async () => {
    await recordOrderProblemSamples(
      [
        { orderId: 1, characterId: 10, problem: 'healthy' },
        { orderId: 2, characterId: 20, problem: 'healthy' },
      ],
      [10, 20],
      NOW
    );
    const stored = await loadOrderProblemSamples([10]);
    expect([...stored.keys()]).toEqual([1]);
  });
});
