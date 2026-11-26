/**
 * D7/D8 extras on top of the deep-dive world: Mira's Large Shield Extender II build (a delivered
 * 20-run job, 12 sales in her wallet, an insurance payout) and a skill sheet where nobody can
 * install the Charon job (Laser Physics), so one Opportunities row is locked.
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mix } from '../../../sandbox/gen';
import { HOUR_MS } from '../../../../../src/lib/age';
import { ARDEN, MIRA, NPC, STATIONS, TOBIN } from '../cast';
import { T, typeName } from '../catalog';
import { fairPrice } from '../market';
import { industryJobs } from '../industry';
import { characterSkills } from '../skills';
import { BALANCES, walletBooks } from '../wallet';

export const PRODUCT = T.largeShieldExtenderII;
export const PRODUCT_NAME = typeName(PRODUCT);
export const RUN_UNITS = 20;
export const JOB_ID = 800_900;
/** Mobile Tractor Unit's blueprint needs both; no other opportunity row does, so exactly one row is locked. Mira lacks one, the others two, so Mira is the closest. */
const HIGH_ENERGY_PHYSICS = 11433;
const LASER_PHYSICS = 11447;

const ACAO = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-pages' };
const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  headers: { ...ACAO, 'x-pages': '1' },
  body: JSON.stringify(body),
});

/** [hours ago, units] of Mira's own sales of the product (the run's 20 units: 12 sold, 2 lost, 6 on the order). */
export const SALES: [number, number][] = [
  [70, 5],
  [47, 4],
  [21, 3],
];
export const SALE_UNIT_PRICES = SALES.map(([hours], i) =>
  Math.round(fairPrice(STATIONS.jita, PRODUCT) * (0.994 + i * 0.002) * 100) / 100
);
const LOSS_PAYOUT = 310_000;
const LOSS_HOURS = 30;

/** Mira's books with the product's sales, their tax and fees, and the insurance payout folded in. */
export function miraBooks() {
  const base = walletBooks(MIRA.id);
  const journal = base.journal.map((row) => ({ ...row }));
  const transactions = base.transactions.map((row) => ({ ...row }));
  type Row = (typeof journal)[number];
  const extras: Row[] = [];
  SALES.forEach(([hours, qty], i) => {
    const date = new Date(Date.now() - hours * HOUR_MS).toISOString();
    const price = SALE_UNIT_PRICES[i];
    const total = Math.round(price * qty * 100) / 100;
    const id = 5_990_000_000 + i * 10;
    const txId = 6_990_000_000 + i * 10;
    const client = 91_000_003 + i;
    extras.push({
      id,
      date,
      ref_type: 'market_transaction',
      amount: total,
      balance: 0,
      first_party_id: client,
      second_party_id: MIRA.id,
      description: `Market: ${qty} x ${PRODUCT_NAME} sold`,
      context_id: txId,
      context_id_type: 'market_transaction_id',
    });
    extras.push({
      id: id + 1,
      date: new Date(Date.now() - hours * HOUR_MS + 1000).toISOString(),
      ref_type: 'transaction_tax',
      amount: -Math.round(total * 0.0337 * 100) / 100,
      balance: 0,
      first_party_id: MIRA.id,
      second_party_id: NPC.scc.id,
      description: `Transaction tax for ${PRODUCT_NAME}`,
    });
    transactions.push({
      transaction_id: txId,
      date,
      journal_ref_id: id,
      location_id: STATIONS.jita,
      type_id: PRODUCT,
      unit_price: price,
      quantity: qty,
      client_id: client,
      is_buy: false,
      is_personal: true,
    });
  });
  extras.push({
    id: 5_990_000_100,
    date: new Date(Date.now() - 5 * 24 * HOUR_MS).toISOString(),
    ref_type: 'brokers_fee',
    amount: -Math.round(SALE_UNIT_PRICES[0] * 10 * 0.0215 * 100) / 100,
    balance: 0,
    first_party_id: MIRA.id,
    second_party_id: NPC.caldariNavy.id,
    description: `Broker fee for order of ${PRODUCT_NAME}`,
  });
  extras.push({
    id: 5_990_000_200,
    date: new Date(Date.now() - LOSS_HOURS * HOUR_MS).toISOString(),
    ref_type: 'insurance',
    amount: LOSS_PAYOUT,
    balance: 0,
    first_party_id: NPC.scc.id,
    second_party_id: MIRA.id,
    description: 'Insurance payout for Badger',
  });
  const all = [...journal, ...extras].sort((a, b) => a.date.localeCompare(b.date));
  let running = BALANCES[MIRA.id];
  for (let i = all.length - 1; i >= 0; i -= 1) {
    all[i].balance = Math.round(running * 100) / 100;
    running -= all[i].amount;
  }
  return {
    journal: all.reverse(),
    transactions: transactions.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** Mira's LSE II job is delivered, 20 runs, finished a day ago. */
function miraJobs() {
  const hour = (h: number) => new Date(Date.now() + h * HOUR_MS).toISOString();
  const jobs = industryJobs(MIRA.id).map((job) => ({ ...job }));
  const lse = jobs.find((job) => job.product_type_id === PRODUCT);
  if (lse) {
    Object.assign(lse, {
      job_id: JOB_ID,
      runs: RUN_UNITS,
      status: 'delivered',
      start_date: hour(-52),
      end_date: hour(-26),
      completed_date: hour(-26),
      cost: 612_400,
      licensed_runs: 20,
    });
  }
  return jobs;
}

const data = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`../../../../../public/data/${file}`, import.meta.url), 'utf8'));
const SYSTEM_ROWS = data<{ id: number; regionId: number }[]>('market/systems.json');
const STATION_ROWS = data<{ id: number; systemId: number; ownerCorporationId: number }[]>('market/stations.json');

/** Job cost index per system: Lonetrek's hub-side systems are dear, their neighbours cheaper, so "cheaper systems nearby" has answers. */
function costIndex(systemId: number, regionId: number): number {
  if (systemId === 30000142) return 0.0512;
  if (systemId === 30001379) return 0.0384; // Tunttaras
  if (regionId === 10000016) return 0.0112 + (mix(systemId) % 14) / 1000;
  return 0.014 + (mix(systemId) % 36) / 1000;
}

export async function installD7(page: Page, opts: { lockCharon?: boolean; lockSubBuild?: boolean } = {}) {
  // An empty-but-synced public contract snapshot, so the Opportunities scan has no "couldn't check Contract" note.
  await page.route('https://data.neocomdesk.com/contract-offers/**', async (route) => {
    const body = route.request().url().endsWith('index.json')
      ? { lastSyncedAt: Date.now() - 20 * 60_000, types: {}, regionIds: [10000002] }
      : [];
    await route.fulfill({ status: 200, headers: ACAO, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route(/esi\.evetech\.net\/(?:.*\/)?industry\/(systems|facilities)\/?(\?.*)?$/, async (route) => {
    if (/industry\/systems/.test(route.request().url())) {
      return route.fulfill(json(SYSTEM_ROWS.map((row) => ({
        solar_system_id: row.id,
        cost_indices: ['manufacturing', 'reaction', 'researching_time_efficiency', 'researching_material_efficiency', 'copying', 'invention'].map((activity) => ({ activity, cost_index: costIndex(row.id, row.regionId) })),
      }))));
    }
    return route.fulfill(json(STATION_ROWS.map((row) => ({ facility_id: row.id, owner_id: row.ownerCorporationId, region_id: SYSTEM_ROWS.find((s) => s.id === row.systemId)?.regionId ?? 0, solar_system_id: row.systemId, type_id: 1531, tax: 0 }))));
  });
  await page.route(/esi\.evetech\.net\/(?:.*\/)?characters\/(\d+)\/(skills|industry\/jobs|wallet\/journal|wallet\/transactions)\/?(\?.*)?$/, async (route) => {
    const match = /characters\/(\d+)\/(skills|industry\/jobs|wallet\/journal|wallet\/transactions)/.exec(route.request().url())!;
    const id = Number(match[1]);
    const kind = match[2];
    if (kind === 'skills' && opts.lockCharon !== false) {
      const sheet = characterSkills(id);
      const skills = sheet.skills.filter((s) => s.skill_id !== LASER_PHYSICS && (id === MIRA.id || s.skill_id !== HIGH_ENERGY_PHYSICS));
      const capped = opts.lockSubBuild ? skills.map((s) => (s.skill_id === 11443 ? { ...s, active_skill_level: 2, trained_skill_level: 2 } : s)) : skills;
      return route.fulfill(json({ ...sheet, skills: capped }));
    }
    if (id === MIRA.id && kind === 'industry/jobs') return route.fulfill(json(miraJobs()));
    if (id === MIRA.id && kind === 'wallet/journal') return route.fulfill(json(miraBooks().journal));
    if (id === MIRA.id && kind === 'wallet/transactions') return route.fulfill(json(miraBooks().transactions));
    return route.fallback();
  });
}
export { ARDEN, TOBIN };
