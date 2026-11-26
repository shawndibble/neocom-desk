/**
 * D4's own LP Store answers, for the Implant Finder's "LP Store" prices: the world mocks no
 * loyalty stores. One store (Caldari Navy) sells a few Zainou 'Deadeye' missile implants for LP
 * plus ISK, beside ordinary navy offers so the store has a market LP Value; every other store
 * answers empty (the finder reads all of them).
 */
import type { Page } from '@playwright/test';

const CALDARI_NAVY = 1000035;
const offer = (id: number, type: number, lp: number, isk: number, qty = 1) => ({
  offer_id: id,
  type_id: type,
  quantity: qty,
  lp_cost: lp,
  isk_cost: isk,
  required_items: [] as { quantity: number; type_id: number }[],
});
const OFFERS = [
  offer(90101, 13249, 1_100, 150_000), // Zainou 'Deadeye' Rapid Launch RL-1003
  offer(90102, 3137, 2_400, 320_000), // Zainou 'Deadeye' Rapid Launch RL-1004
  offer(90103, 3125, 1_700, 210_000), // Zainou 'Deadeye' Guided Missile Precision GP-802
  offer(90104, 27092, 900, 110_000), // Zainou 'Deadeye' Missile Bombardment MB-701
  offer(90201, 27441, 1_200, 400_000, 500), // Caldari Navy Scourge Heavy Missile
  offer(90202, 27361, 500, 150_000, 500), // Caldari Navy Scourge Light Missile
  offer(90203, 17498, 8_000, 800_000), // Caldari Navy Multispectrum Shield Hardener
  offer(90204, 15681, 6_000, 600_000), // Caldari Navy Ballistic Control System
  offer(90205, 31930, 7_500, 750_000), // Caldari Navy Large Shield Extender
];

export const D4_SETTINGS = [{ key: 'sync.loyaltyLpValue', value: 1_500 }];

export async function installLpStores(page: Page) {
  // Arden holds Caldari Navy LP, so offers read "you can buy" rather than "LP short".
  await page.route(/^https:\/\/esi\.evetech\.net\/(?:[^/]+\/)?characters\/90000001\/loyalty\/points\/?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([{ corporation_id: CALDARI_NAVY, loyalty_points: 184_000 }]),
    });
  });
  await page.route(/^https:\/\/esi\.evetech\.net\/(?:[^/]+\/)?loyalty\/stores\/(\d+)\/offers\/?(?:\?.*)?$/, async (route) => {
    const corporation = Number(/stores\/(\d+)\//.exec(route.request().url())?.[1]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'x-pages': '1' },
      body: JSON.stringify(corporation === CALDARI_NAVY ? OFFERS : []),
    });
  });
}
