import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { rememberBuybackLinks, type BuybackLinkInfo } from './buybackLinks';

const info = (requestId: string, quotedTotal = 100): BuybackLinkInfo => ({
  requestId,
  communityId: 'c1',
  communityName: 'Efa Miners',
  requestTitle: 'All ore',
  quotedTotal,
});
const read = async (characterId: number) =>
  ((await db.settings.get(`buybackLinks:${characterId}`))?.value ?? {}) as Record<string, unknown>;

beforeEach(async () => {
  await db.settings.clear();
});

describe('rememberBuybackLinks', () => {
  it('stores what a sync learned, per Character', async () => {
    await rememberBuybackLinks(1, new Map([[11, info('r1')]]));
    expect(await read(1)).toEqual({ '11': info('r1') });
    expect(await read(2)).toEqual({});
  });

  it('adds to what is there and updates a contract it knew', async () => {
    await rememberBuybackLinks(1, new Map([[11, info('r1')]]));
    await rememberBuybackLinks(
      1,
      new Map([
        [12, info('r2')],
        [11, info('r1', 250)],
      ])
    );
    expect(await read(1)).toEqual({ '11': info('r1', 250), '12': info('r2') });
  });

  it('writes nothing for an empty or unchanged result', async () => {
    await rememberBuybackLinks(1, new Map());
    expect(await db.settings.get('buybackLinks:1')).toBeUndefined();
  });

  it('keeps the newest 200', async () => {
    const many = new Map(Array.from({ length: 210 }, (_, i) => [i + 1, info(`r${i}`)] as const));
    await rememberBuybackLinks(1, many);
    const stored = await read(1);
    expect(Object.keys(stored)).toHaveLength(200);
    expect(stored['1']).toBeUndefined();
    expect(stored['210']).toBeDefined();
  });
});
