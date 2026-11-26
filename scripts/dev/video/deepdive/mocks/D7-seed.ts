/**
 * Earlier builds for the Production Log chart: five plans with two or three logged runs each, their
 * sales linked by hand over the last four weeks. Written straight into the app's IndexedDB (local
 * data), then the page reloads so the live queries pick them up.
 */
import type { Page } from '@playwright/test';
import { DAY_MS } from '../../../../../src/lib/age';
import { MIRA, STATIONS } from '../cast';
import { BASE_PRICE, T } from '../catalog';

interface Hist {
  name: string;
  blueprint: number;
  product: number;
  /** [days ago logged, units, [days ago, units] sales...] */
  runs: [number, number, [number, number][]][];
  costShare: number;
}

const HISTORY: Hist[] = [
  { name: 'Nanite Repair Paste', blueprint: 2739, product: T.nanitePaste, costShare: 0.57, runs: [[27, 800, [[25, 300], [22, 350], [19, 150]]], [12, 900, [[10, 400], [7, 350], [4, 150]]]] },
  { name: 'Rifter', blueprint: 691, product: T.rifter, costShare: 0.66, runs: [[24, 25, [[21, 10], [17, 10], [15, 5]]], [9, 30, [[7, 12], [5, 12], [2, 4]]]] },
  { name: 'Cap Booster 400', blueprint: 11288, product: T.capBooster400, costShare: 0.6, runs: [[20, 3000, [[18, 1500], [14, 1500]]], [6, 4000, [[4, 2500], [2, 1000]]]] },
  { name: 'Inertial Stabilizers II', blueprint: 1406, product: T.inertialStabilizersII, costShare: 0.55, runs: [[16, 40, [[13, 20], [11, 20]]], [3, 48, [[2, 20]]]] },
  { name: 'Hornet II', blueprint: 2467, product: T.hornetII, costShare: 0.58, runs: [[26, 300, [[23, 150], [20, 150]]], [14, 360, [[12, 200], [9, 160]]]] },
];

export async function seedHistory(page: Page): Promise<void> {
  const now = Date.now();
  const plans: unknown[] = [];
  const runs: unknown[] = [];
  const links: unknown[] = [];
  let n = 0;
  for (const h of HISTORY) {
    const planId = `hist-plan-${h.product}`;
    plans.push({
      id: planId, characterId: MIRA.id, name: h.name, blueprintTypeID: h.blueprint, runs: 10, me: 10, te: 20,
      facility: 'npcStation', rigFit: ['none', 'none', 'none'], security: 'highsec', hubId: 'jita', updatedAt: now - 30 * DAY_MS,
    });
    for (const [logged, qty, sales] of h.runs) {
      const price = BASE_PRICE[h.product];
      const runId = `hist-run-${h.product}-${logged}`;
      const total = Math.round(price * qty * h.costShare);
      runs.push({
        id: runId, characterId: MIRA.id, buildPlanId: planId, productTypeID: h.product, quantity: qty,
        materialCost: Math.round(total * 0.93), jobFee: total - Math.round(total * 0.93), totalCost: total,
        loggedAt: now - logged * DAY_MS, updatedAt: now - logged * DAY_MS,
      });
      for (const [ago, units] of sales) {
        n += 1;
        links.push({
          id: `${MIRA.id}:manual:hist-${n}`, characterId: MIRA.id, runId, quantity: units,
          unitPrice: Math.round(price * (0.99 + (n % 5) / 200) * 100) / 100, linkedAt: now - ago * DAY_MS, updatedAt: now - ago * DAY_MS,
        });
      }
    }
  }
  await page.evaluate(async (seed) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neocom');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['buildPlans', 'productionRuns', 'productionSaleLinks'], 'readwrite');
      for (const row of seed.plans) tx.objectStore('buildPlans').put(row);
      for (const row of seed.runs) tx.objectStore('productionRuns').put(row);
      for (const row of seed.links) tx.objectStore('productionSaleLinks').put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, { plans, runs, links });
}
export { STATIONS };
