import type { Page } from '@playwright/test';
import { ARDEN, MIRA, TOBIN } from '../cast';
import { OWN_ORDERS, ownPrice, tick4 } from '../market';
import { createNumberFormat } from '../../../../../src/lib/numberLocale';

const MIN = 60_000;
const money = createNumberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface FeedRow {
  id: string;
  characterId: number;
  eventId: string;
  title: string;
  body: string;
  firedAt: number;
  eveType?: string;
  walletChangeIsk?: number;
  subjectId?: number;
  typeId?: number;
}

function undercut(
  orderId: number,
  character: string,
  item: string,
  minutesAgo: number,
  now: number
): FeedRow {
  const spec = OWN_ORDERS.find((o) => o.id === orderId)!;
  const price = ownPrice(spec);
  const rival = tick4(price * (1 - (spec.undercutBy ?? 0)));
  return {
    id: `d15-undercut-${orderId}`,
    characterId: spec.owner,
    eventId: 'marketOrderUndercut',
    title: 'Order undercut',
    body: `${character}'s ${item} sell order at ${money(price)} ISK was undercut. Lowest price at its station: ${money(rival)} ISK.`,
    firedAt: now - minutesAgo * MIN,
    subjectId: orderId,
    typeId: spec.typeId,
  };
}

export function seedRows(now = Date.now()): FeedRow[] {
  const wallet = (
    n: number,
    who: { id: number; name: string },
    isk: number,
    minutesAgo: number
  ): FeedRow => ({
    id: `d15-wallet-${n}`,
    characterId: who.id,
    eventId: 'walletBalanceChanged',
    title: 'Wallet balance changed',
    body: `${who.name}'s wallet balance changed by ${money(isk)} ISK.`,
    firedAt: now - minutesAgo * MIN,
    walletChangeIsk: isk,
    subjectId: 8_100_000_000 + n,
  });
  return [
    {
      id: 'd15-skillq-tobin',
      characterId: TOBIN.id,
      eventId: 'skillQueueEnding',
      title: 'Skill queue ending soon',
      body: "Tobin Raske's skill queue will run dry in under 24 hours.",
      firedAt: now - 9 * MIN,
    },
    undercut(6_100_000_001, 'Arden Kessil', 'Drake', 34, now),
    undercut(6_100_000_008, 'Arden Kessil', 'Gila', 52, now),
    undercut(6_200_000_003, 'Mira Voskane', 'Retriever', 71, now),
    {
      id: 'd15-mail-arden',
      characterId: ARDEN.id,
      eventId: 'newMail',
      title: 'New mail',
      body: 'Arden Kessil has new mail from Sela Marrow: Fleet tonight, 19:00',
      firedAt: now - 98 * MIN,
    },
    wallet(1, ARDEN, 12_400_000, 121),
    wallet(2, MIRA, 3_100_000, 139),
    wallet(3, ARDEN, 48_900_000, 160),
    wallet(4, MIRA, 7_600_000, 176),
  ];
}

export function dangerRow(now = Date.now()): FeedRow {
  return {
    id: 'd15-danger-athanor',
    characterId: ARDEN.id,
    eventId: 'eveNotification',
    eveType: 'StructureUnderAttack',
    title: 'Structure under attack',
    body: 'Arden Kessil: Nourvukaiken - Halcyon Forge Athanor is under attack by Grey Tithe Brokers.',
    firedAt: now,
  };
}

export async function putFeed(page: Page, rows: FeedRow[], clear = true): Promise<void> {
  await page.evaluate(
    async ({ rows, clear }) => {
      const m = await import('/src/db/index.ts');
      if (clear) await m.db.notificationFeed.clear();
      await m.db.notificationFeed.bulkPut(rows);
    },
    { rows, clear }
  );
}

export async function feedIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const m = await import('/src/db/index.ts');
    return (await m.db.notificationFeed.toArray()).map((r: { id: string }) => r.id);
  });
}
