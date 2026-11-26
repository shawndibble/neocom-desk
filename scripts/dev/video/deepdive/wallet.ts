/**
 * Thirty days of wallet journal and market transactions for the cast. Built oldest-first from a
 * small per-character activity plan, then balanced backwards from the character's current
 * balance so every row's running balance is consistent. Prices are the world's fair prices
 * (market.ts), so a sale of a Drake here matches the Drake on the order book.
 */
import { HOUR_MS } from '../../../../src/lib/age';
import { mix } from '../../sandbox/gen';
import { ARDEN, MIRA, NPC, STATIONS, TOBIN } from './cast';
import { T, typeName } from './catalog';
import { fairPrice } from './market';

export const BALANCES: Record<number, number> = {
  [ARDEN.id]: 3_862_419_284.56,
  [MIRA.id]: 612_880_131.4,
  [TOBIN.id]: 287_455_903.88,
};

/** First id of the generated counterparties; names live in sandbox/socialEsi.ts (`nameFor`). */
const PILOT_BASE = 91_000_000;
const CORP_BASE = 92_000_000;

interface Journal {
  id: number;
  date: string;
  ref_type: string;
  amount: number;
  balance: number;
  first_party_id: number;
  second_party_id: number;
  description: string;
  reason?: string;
  tax?: number;
  tax_receiver_id?: number;
  context_id?: number;
  context_id_type?: string;
}
interface Transaction {
  transaction_id: number;
  date: string;
  location_id: number;
  type_id: number;
  unit_price: number;
  quantity: number;
  client_id: number;
  is_buy: boolean;
  is_personal: boolean;
  journal_ref_id: number;
}

interface Plan {
  /** Items the character sells, with a per-sale quantity range. */
  sells: { typeId: number; station: number; qty: [number, number]; adj?: number }[];
  buys: { typeId: number; station: number; qty: [number, number]; adj?: number }[];
  /** Sales per day (fractional ok) and purchases per day. */
  sellsPerDay: number;
  buysPerDay: number;
  /** Bounty payouts per day, ISK range. */
  bounties?: { perDay: number; range: [number, number] };
  missions?: { everyDays: number; range: [number, number] };
  courier?: { everyDays: number; range: [number, number] };
  industry?: { perDay: number; range: [number, number] };
}

const PLANS: Record<number, Plan> = {
  [ARDEN.id]: {
    sells: [
      { typeId: T.drake, station: STATIONS.nourvukaiken, qty: [1, 2] },
      { typeId: T.heavyMissileLauncherII, station: STATIONS.jita, qty: [2, 6] },
      { typeId: T.scourgeFury, station: STATIONS.tunttaras, qty: [3_000, 12_000] },
      { typeId: T.damageControlII, station: STATIONS.jita, qty: [2, 5] },
      { typeId: T.largeShieldExtenderII, station: STATIONS.nourvukaiken, qty: [1, 2] },
      { typeId: T.ballisticControlII, station: STATIONS.jita, qty: [2, 4] },
      { typeId: T.hobgoblinII, station: STATIONS.nourvukaiken, qty: [10, 30] },
      { typeId: T.gila, station: STATIONS.jita, qty: [1, 1] },
      { typeId: T.warpDisruptorII, station: STATIONS.sarekuwa, qty: [3, 8] },
      { typeId: T.stasisWebifierII, station: STATIONS.jita, qty: [3, 8] },
    ],
    buys: [
      { typeId: T.tritanium, station: STATIONS.nourvukaiken, qty: [400_000, 900_000], adj: 0.93 },
      { typeId: T.pyerite, station: STATIONS.jita, qty: [80_000, 200_000], adj: 0.97 },
      { typeId: T.mediumShieldExtenderII, station: STATIONS.jita, qty: [10, 25], adj: 0.96 },
      { typeId: T.scourgeHeavy, station: STATIONS.tunttaras, qty: [8_000, 20_000], adj: 0.97 },
      { typeId: T.drake, station: STATIONS.jita, qty: [1, 2], adj: 0.97 },
      { typeId: T.gila, station: STATIONS.jita, qty: [1, 1], adj: 0.975 },
    ],
    sellsPerDay: 2.6,
    buysPerDay: 1.1,
    bounties: { perDay: 2, range: [6_400_000, 34_800_000] },
    missions: { everyDays: 4, range: [3_200_000, 9_700_000] },
  },
  [MIRA.id]: {
    sells: [
      { typeId: T.hurricane, station: STATIONS.nourvukaiken, qty: [1, 3] },
      { typeId: T.retriever, station: STATIONS.tunttaras, qty: [1, 2] },
      { typeId: T.rifter, station: STATIONS.nourvukaiken, qty: [3, 8] },
      { typeId: T.nanitePaste, station: STATIONS.tunttaras, qty: [300, 900] },
      { typeId: T.inertialStabilizersII, station: STATIONS.jita, qty: [4, 10] },
      { typeId: T.capBooster400, station: STATIONS.nourvukaiken, qty: [1_000, 3_000] },
      { typeId: T.hornetII, station: STATIONS.sarekuwa, qty: [20, 60] },
    ],
    buys: [
      { typeId: T.tritanium, station: STATIONS.jita, qty: [1_500_000, 3_000_000], adj: 0.98 },
      { typeId: T.pyerite, station: STATIONS.jita, qty: [400_000, 900_000], adj: 0.98 },
      { typeId: T.mexallon, station: STATIONS.jita, qty: [60_000, 140_000], adj: 0.98 },
      { typeId: T.isogen, station: STATIONS.jita, qty: [20_000, 60_000], adj: 0.98 },
      { typeId: T.nocxium, station: STATIONS.jita, qty: [4_000, 12_000], adj: 0.98 },
    ],
    sellsPerDay: 1.8,
    buysPerDay: 1.3,
    industry: { perDay: 1.4, range: [180_000, 1_450_000] },
  },
  [TOBIN.id]: {
    sells: [
      { typeId: T.cVeldspar, station: STATIONS.tunttaras, qty: [40_000, 120_000] },
      { typeId: T.cScordite, station: STATIONS.nourvukaiken, qty: [20_000, 60_000] },
      { typeId: T.cPyroxeres, station: STATIONS.tunttaras, qty: [8_000, 30_000] },
      { typeId: T.tritanium, station: STATIONS.jita, qty: [500_000, 1_400_000] },
      { typeId: T.pyerite, station: STATIONS.jita, qty: [200_000, 500_000] },
      { typeId: T.mexallon, station: STATIONS.nourvukaiken, qty: [20_000, 60_000] },
    ],
    buys: [
      { typeId: T.isogen, station: STATIONS.jita, qty: [30_000, 80_000], adj: 0.94 },
      { typeId: T.cVeldspar, station: STATIONS.dodixie, qty: [60_000, 150_000], adj: 0.97 },
    ],
    sellsPerDay: 1.2,
    buysPerDay: 0.8,
    courier: { everyDays: 2, range: [9_500_000, 61_000_000] },
  },
};

/** Transfers between the alts and the main: [days ago, from, to, ISK, reason]. */
const TRANSFERS: [number, number, number, number, string][] = [
  [27, ARDEN.id, MIRA.id, 120_000_000, 'Blueprint copies and job budget'],
  [21, TOBIN.id, ARDEN.id, 40_000_000, 'Freight margin'],
  [14, MIRA.id, ARDEN.id, 250_000_000, 'Hurricane batch proceeds'],
  [8, ARDEN.id, TOBIN.id, 150_000_000, 'Collateral top-up'],
  [3, MIRA.id, TOBIN.id, 35_000_000, 'Hauling fees'],
];

const SALES_TAX = 0.0337;
const BROKER_FEE = 0.0215;

interface Raw {
  at: number;
  ref_type: string;
  amount: number;
  first: number;
  second: number;
  description: string;
  reason?: string;
  tax?: number;
  taxReceiver?: number;
  tx?: Omit<Transaction, 'transaction_id' | 'journal_ref_id' | 'date'>;
}

const roundIsk = (n: number) => Math.round(n * 100) / 100;

function rawEntries(characterId: number): Raw[] {
  const plan = PLANS[characterId];
  const out: Raw[] = [];
  const now = Date.now();
  const at = (day: number, slot: number) => {
    // Never in the future: today's rows sit at least an hour back.
    const back = day * 24 + 1.2 + ((slot * 7.3 + day * 3.1) % 22);
    return now - back * HOUR_MS;
  };
  for (let day = 0; day < 30; day += 1) {
    const seed = day * 17 + characterId;
    const sellCount = Math.floor(plan.sellsPerDay) + (mix(seed) / 1000 < plan.sellsPerDay % 1 ? 1 : 0);
    for (let k = 0; k < sellCount; k += 1) {
      const pick = plan.sells[mix(seed + k * 5) % plan.sells.length];
      const qty = pick.qty[0] + (mix(seed + k * 11) % (pick.qty[1] - pick.qty[0] + 1));
      const price = roundIsk(fairPrice(pick.station, pick.typeId) * (pick.adj ?? 0.999 + (mix(seed + k) % 8) / 1000));
      const client = PILOT_BASE + (mix(seed + k * 3) % 10);
      const total = roundIsk(price * qty);
      out.push({
        at: at(day, k + 1),
        ref_type: 'market_transaction',
        amount: total,
        first: client,
        second: characterId,
        description: `Market: ${qty.toLocaleString('en')} x ${typeName(pick.typeId)} sold`,
        tx: { location_id: pick.station, type_id: pick.typeId, unit_price: price, quantity: qty, client_id: client, is_buy: false, is_personal: true },
      });
      out.push({
        at: at(day, k + 1) + 1000,
        ref_type: 'transaction_tax',
        amount: -roundIsk(total * SALES_TAX),
        first: characterId,
        second: NPC.scc.id,
        description: `Transaction tax for ${typeName(pick.typeId)}`,
      });
      if (mix(seed + k * 29) % 3 === 0) {
        out.push({
          at: at(day, k + 1) - 3_600_000 * 20,
          ref_type: 'brokers_fee',
          amount: -roundIsk(total * BROKER_FEE),
          first: characterId,
          second: NPC.caldariNavy.id,
          description: `Broker fee for order of ${typeName(pick.typeId)}`,
        });
      }
    }
    const buyCount = Math.floor(plan.buysPerDay) + (mix(seed + 77) / 1000 < plan.buysPerDay % 1 ? 1 : 0);
    for (let k = 0; k < buyCount; k += 1) {
      const pick = plan.buys[mix(seed + k * 13 + 3) % plan.buys.length];
      const qty = pick.qty[0] + (mix(seed + k * 19) % (pick.qty[1] - pick.qty[0] + 1));
      const price = roundIsk(fairPrice(pick.station, pick.typeId) * (pick.adj ?? 0.97));
      const client = PILOT_BASE + (mix(seed + k * 7 + 4) % 10);
      out.push({
        at: at(day, k + 4),
        ref_type: 'market_transaction',
        amount: -roundIsk(price * qty),
        first: characterId,
        second: client,
        description: `Market: ${qty.toLocaleString('en')} x ${typeName(pick.typeId)} bought`,
        tx: { location_id: pick.station, type_id: pick.typeId, unit_price: price, quantity: qty, client_id: client, is_buy: true, is_personal: true },
      });
    }
    if (plan.bounties) {
      for (let k = 0; k < plan.bounties.perDay; k += 1) {
        const [lo, hi] = plan.bounties.range;
        // Quiet days: the main does not rat every day.
        if (mix(seed + 400) % 9 === 0) continue;
        out.push({
          at: at(day, k + 8),
          ref_type: 'bounty_prizes',
          amount: roundIsk(lo + ((mix(seed + k * 23) / 1000) * (hi - lo))),
          first: NPC.concord.id,
          second: characterId,
          description: `Bounty prizes: ${8 + (mix(seed + k) % 30)} kills`,
        });
      }
    }
    if (plan.missions && day % plan.missions.everyDays === 1) {
      const [lo, hi] = plan.missions.range;
      out.push({
        at: at(day, 15),
        ref_type: 'agent_mission_reward',
        amount: roundIsk(lo + (mix(seed + 5) / 1000) * (hi - lo)),
        first: NPC.caldariNavy.id,
        second: characterId,
        description: 'Agent mission reward',
      });
      out.push({
        at: at(day, 15) + 60_000,
        ref_type: 'agent_mission_time_bonus_reward',
        amount: roundIsk((lo + (mix(seed + 5) / 1000) * (hi - lo)) * 0.4),
        first: NPC.caldariNavy.id,
        second: characterId,
        description: 'Agent mission time bonus',
      });
    }
    if (plan.courier && day % plan.courier.everyDays === 0) {
      const [lo, hi] = plan.courier.range;
      out.push({
        at: at(day, 12),
        ref_type: 'contract_reward',
        amount: roundIsk(lo + (mix(seed + 9) / 1000) * (hi - lo)),
        first: CORP_BASE + (mix(seed) % 4),
        second: characterId,
        description: 'Courier contract reward',
      });
    }
    if (plan.industry) {
      const count = mix(seed + 61) / 1000 < plan.industry.perDay % 1 ? 2 : 1;
      for (let k = 0; k < count; k += 1) {
        const [lo, hi] = plan.industry.range;
        out.push({
          at: at(day, 17 + k),
          ref_type: 'manufacturing',
          amount: -roundIsk(lo + (mix(seed + k * 31) / 1000) * (hi - lo)),
          first: characterId,
          second: NPC.scc.id,
          description: 'Industry job installation',
        });
      }
    }
  }
  // Transfers between the cast, on both sides' books.
  for (const [days, from, to, amount, reason] of TRANSFERS) {
    if (characterId !== from && characterId !== to) continue;
    out.push({
      at: now - (days * 24 + 5.5) * HOUR_MS,
      ref_type: 'player_donation',
      amount: characterId === from ? -amount : amount,
      first: from,
      second: to,
      description: `Transfer between your characters`,
      reason,
    });
  }
  // One insurance payout, one premium: the Gila Arden lost in a roam and replaced.
  if (characterId === ARDEN.id) {
    out.push({
      at: now - (11 * 24 + 9.2) * HOUR_MS,
      ref_type: 'insurance',
      amount: 62_340_000,
      first: NPC.scc.id,
      second: ARDEN.id,
      description: 'Insurance payout for Gila',
    });
    out.push({
      at: now - (10 * 24 + 22) * HOUR_MS,
      ref_type: 'insurance',
      amount: -9_760_000,
      first: ARDEN.id,
      second: NPC.scc.id,
      description: 'Insurance premium for Gila',
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

const cache = new Map<number, { journal: Journal[]; transactions: Transaction[] }>();

export function walletBooks(characterId: number): { journal: Journal[]; transactions: Transaction[] } {
  const hit = cache.get(characterId);
  if (hit) return hit;
  const raws = rawEntries(characterId);
  const base = 5_000_000_000 + (characterId % 100) * 100_000_000;
  const txBase = 6_000_000_000 + (characterId % 100) * 100_000_000;
  // Balance after each entry, from today's balance backwards.
  const balances = new Array<number>(raws.length);
  let running = BALANCES[characterId];
  for (let i = raws.length - 1; i >= 0; i -= 1) {
    balances[i] = roundIsk(running);
    running -= raws[i].amount;
  }
  const journal: Journal[] = [];
  const transactions: Transaction[] = [];
  raws.forEach((raw, index) => {
    const id = base + index;
    const date = new Date(raw.at).toISOString();
    journal.push({
      id,
      date,
      ref_type: raw.ref_type,
      amount: raw.amount,
      balance: balances[index],
      first_party_id: raw.first,
      second_party_id: raw.second,
      description: raw.description,
      ...(raw.reason ? { reason: raw.reason } : {}),
      ...(raw.tx ? { context_id: txBase + index, context_id_type: 'market_transaction_id' } : {}),
    });
    if (raw.tx) transactions.push({ transaction_id: txBase + index, date, journal_ref_id: id, ...raw.tx });
  });
  const result = { journal: journal.reverse(), transactions: transactions.reverse() };
  cache.set(characterId, result);
  return result;
}
