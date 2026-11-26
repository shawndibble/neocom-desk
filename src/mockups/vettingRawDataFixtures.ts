import { DAY_MS, HOUR_MS } from '@/lib/age';

export type SourceId = 'wallet' | 'contact' | 'mail' | 'contract' | 'skills' | 'history';

export const SOURCE_IDS: readonly SourceId[] = [
  'wallet',
  'contact',
  'mail',
  'contract',
  'skills',
  'history',
];

export const SOURCE_LABEL: Record<SourceId, string> = {
  wallet: 'Wallet journal',
  contact: 'Contacts',
  mail: 'Mail headers',
  contract: 'Contracts',
  skills: 'Skills',
  history: 'Corporation history',
};

export const READ_AT = Date.parse('2026-11-14T10:00:00Z');

export interface Pilot {
  characterId: number;
  name: string;
  corporation: string;
}

export const PILOTS: readonly Pilot[] = [
  {
    characterId: 2118000001,
    name: 'Tamsin Vell',
    corporation: 'Hollow Reach Mining',
  },
  {
    characterId: 2118000002,
    name: 'Mira Vell',
    corporation: 'Hollow Reach Mining',
  },
  {
    characterId: 2118000003,
    name: 'Vell Hauling',
    corporation: 'Caldari Provisions',
  },
];

export interface FlagRef {
  id: 'watchlistIsk' | 'cynoNoCapital';
  title: string;
}

export interface Party {
  id: number;
  name: string;
  category: 'character' | 'corporation' | 'alliance';
  corporation?: string;
}

export interface RawRow {
  key: string;
  characterId: number;
  at: string | null;
  party?: Party;
  what: string;
  amount?: number;
  standing?: number;
  direction?: 'Sent' | 'Received';
  recipients?: string[];
  status?: string;
  group?: string;
  level?: number;
  joined?: string;
  left?: string | null;
  flag?: FlagRef;
}

const BLACK_KITE: Party = { id: 98111001, name: 'Black Kite Syndicate', category: 'corporation' };
const CORVIN: Party = {
  id: 2118000010,
  name: 'Corvin Hale',
  category: 'character',
  corporation: 'Black Kite Syndicate',
};
const ORRIN: Party = {
  id: 2118000011,
  name: 'Orrin Dask',
  category: 'character',
  corporation: 'Quiet Harbor Freight',
};

export const FLAG_ISK: FlagRef = { id: 'watchlistIsk', title: 'Watchlist ISK' };
export const FLAG_CYNO: FlagRef = { id: 'cynoNoCapital', title: 'Cyno skill, no capital' };

const FIRST = [
  'Ansel',
  'Brisa',
  'Calder',
  'Dessa',
  'Eron',
  'Fenna',
  'Garen',
  'Hale',
  'Isolde',
  'Jory',
];
const LAST = [
  'Marsh',
  'Okoro',
  'Veld',
  'Thorne',
  'Quist',
  'Lorne',
  'Pike',
  'Draycott',
  'Imre',
  'Solis',
];
const CORPS = [
  'Hollow Reach Mining',
  'Quiet Harbor Freight',
  'Jita Hauling Co',
  'Amarr Trade Union',
  'Pale Lantern',
  'Dock Nine Traders',
  'Ember Fleet Logistics',
];

const PEOPLE: Party[] = FIRST.flatMap((first, i) =>
  LAST.map((last, j) => ({
    id: 2118100000 + i * 10 + j,
    name: `${first} ${last}`,
    category: 'character' as const,
    corporation: CORPS[(i * 3 + j) % CORPS.length],
  }))
);
const ORGS: Party[] = CORPS.map((name, i) => ({
  id: 98300000 + i,
  name,
  category: 'corporation' as const,
}));

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(next: () => number, list: readonly T[]): T =>
  list[Math.floor(next() * list.length)];
const isoAgo = (ms: number) => new Date(READ_AT - ms).toISOString();

const WALLET_TYPES: readonly { what: string; sign: 1 | -1 | 0; scale: number }[] = [
  { what: 'Market sale', sign: 1, scale: 40_000_000 },
  { what: 'Market purchase', sign: -1, scale: 35_000_000 },
  { what: 'Transaction tax', sign: -1, scale: 900_000 },
  { what: 'Broker fee', sign: -1, scale: 400_000 },
  { what: 'Bounty prize', sign: 1, scale: 2_500_000 },
  { what: 'Player trade', sign: 0, scale: 80_000_000 },
  { what: 'Contract price', sign: 0, scale: 120_000_000 },
  { what: 'Insurance', sign: 1, scale: 8_000_000 },
  { what: 'Donation', sign: 0, scale: 15_000_000 },
];
function wallet(pilot: Pilot, count: number, seed: number): RawRow[] {
  const next = rng(seed);
  const rows: RawRow[] = [];
  for (let i = 0; i < count; i++) {
    const kind = pick(next, WALLET_TYPES);
    const sign = kind.sign === 0 ? (next() < 0.5 ? 1 : -1) : kind.sign;
    rows.push({
      key: `w${pilot.characterId}-${i}`,
      characterId: pilot.characterId,
      at: isoAgo(Math.floor(next() * 30 * DAY_MS)),
      party:
        kind.what === 'Transaction tax' || kind.what === 'Broker fee'
          ? undefined
          : pick(next, PEOPLE),
      what: kind.what,
      amount: sign * Math.round((0.2 + next() * 1.6) * kind.scale),
    });
  }
  return rows;
}

const flagged = (
  pilot: Pilot,
  days: number,
  party: Party,
  amount: number,
  flag?: FlagRef
): RawRow => ({
  key: `wf${pilot.characterId}-${days}-${party.id}`,
  characterId: pilot.characterId,
  at: isoAgo(days * DAY_MS + 3 * HOUR_MS),
  party,
  what: 'Donation',
  amount,
  flag,
});

function mail(pilot: Pilot, count: number, seed: number): RawRow[] {
  const next = rng(seed);
  const rows: RawRow[] = [];
  for (let i = 0; i < count; i++) {
    const sent = next() < 0.45;
    const other = pick(next, PEOPLE);
    const extra = Array.from({ length: Math.floor(next() * 3) }, () => pick(next, PEOPLE).name);
    rows.push({
      key: `m${pilot.characterId}-${i}`,
      characterId: pilot.characterId,
      at: isoAgo(Math.floor(next() * 400 * DAY_MS)),
      party: other,
      what: 'Mail',
      direction: sent ? 'Sent' : 'Received',
      recipients: sent ? [other.name, ...extra] : [pilot.name, ...extra],
    });
  }
  return rows;
}

function contacts(pilot: Pilot, count: number, seed: number): RawRow[] {
  const next = rng(seed);
  return Array.from({ length: count }, (_, i) => ({
    key: `c${pilot.characterId}-${i}`,
    characterId: pilot.characterId,
    at: null,
    party: next() < 0.2 ? pick(next, ORGS) : PEOPLE[(i * 7 + seed) % PEOPLE.length],
    what: 'Contact',
    standing: pick(next, [-10, -5, -5, 0, 0, 5, 5, 5, 10, 10]),
  }));
}

const CONTRACT_TYPES = ['Item exchange', 'Courier', 'Auction'];
const CONTRACT_STATUS = [
  'Completed',
  'Completed',
  'Completed',
  'Outstanding',
  'Expired',
  'Rejected',
];

function contracts(pilot: Pilot, count: number, seed: number): RawRow[] {
  const next = rng(seed);
  return Array.from({ length: count }, (_, i) => ({
    key: `k${pilot.characterId}-${i}`,
    characterId: pilot.characterId,
    at: isoAgo(Math.floor(next() * 30 * DAY_MS)),
    party: pick(next, PEOPLE),
    what: pick(next, CONTRACT_TYPES),
    amount: Math.round(next() * 400_000_000),
    status: pick(next, CONTRACT_STATUS),
  }));
}

const SKILLS: readonly [string, string][] = [
  ['Spaceship Command', 'Spaceship Command'],
  ['Mining', 'Resource Processing'],
  ['Astrogeology', 'Resource Processing'],
  ['Gas Cloud Harvesting', 'Resource Processing'],
  ['Industry', 'Industry'],
  ['Mass Production', 'Industry'],
  ['Advanced Industry', 'Industry'],
  ['Trade', 'Trade'],
  ['Broker Relations', 'Trade'],
  ['Accounting', 'Trade'],
  ['Marketing', 'Trade'],
  ['Wholesale', 'Trade'],
  ['Cynosural Field Theory', 'Navigation'],
  ['Jump Drive Operation', 'Navigation'],
  ['Navigation', 'Navigation'],
  ['Evasive Maneuvering', 'Navigation'],
  ['Gallente Industrial', 'Spaceship Command'],
  ['Caldari Industrial', 'Spaceship Command'],
  ['Mining Barge', 'Spaceship Command'],
  ['Exhumers', 'Spaceship Command'],
  ['Shield Management', 'Shields'],
  ['Shield Operation', 'Shields'],
  ['Hull Upgrades', 'Armor'],
  ['Mechanics', 'Armor'],
  ['Gunnery', 'Gunnery'],
  ['Small Projectile Turret', 'Gunnery'],
  ['Drones', 'Drones'],
  ['Drone Interfacing', 'Drones'],
  ['Social', 'Social'],
  ['Connections', 'Social'],
];

function skills(pilot: Pilot, count: number, seed: number): RawRow[] {
  const next = rng(seed);
  return SKILLS.slice(0, count).map(([what, group]) => ({
    key: `s${pilot.characterId}-${what}`,
    characterId: pilot.characterId,
    at: null,
    what,
    group,
    level:
      what === 'Cynosural Field Theory' && pilot.characterId === PILOTS[0].characterId
        ? 5
        : 1 + Math.floor(next() * 5),
    flag:
      what === 'Cynosural Field Theory' && pilot.characterId === PILOTS[0].characterId
        ? FLAG_CYNO
        : undefined,
  }));
}

const HISTORY: Record<number, [string, string, string | null][]> = {
  2118000001: [
    ['Hollow Reach Mining', '2026-03-02', null],
    ['Quiet Harbor Freight', '2025-09-14', '2026-03-02'],
    ['Pale Lantern', '2025-05-20', '2025-09-14'],
    ['Dock Nine Traders', '2024-11-01', '2025-05-20'],
    ['Amarr Trade Union', '2023-02-17', '2024-11-01'],
    ['Caldari Provisions', '2019-04-22', '2023-02-17'],
  ],
  2118000002: [
    ['Hollow Reach Mining', '2026-04-11', null],
    ['Caldari Provisions', '2021-06-30', '2026-04-11'],
  ],
  2118000003: [['Caldari Provisions', '2023-12-20', null]],
};

function history(pilot: Pilot): RawRow[] {
  return (HISTORY[pilot.characterId] ?? []).map(([what, joined, left]) => ({
    key: `h${pilot.characterId}-${joined}`,
    characterId: pilot.characterId,
    at: `${joined}T00:00:00Z`,
    what,
    joined,
    left,
  }));
}

const [TAMSIN, MIRA, HAULING] = PILOTS;

export const ROWS: Record<SourceId, RawRow[]> = {
  wallet: [
    ...wallet(TAMSIN, 3946, 11),
    flagged(TAMSIN, 3, CORVIN, 500_000_000, FLAG_ISK),
    flagged(TAMSIN, 10, CORVIN, 400_000_000, FLAG_ISK),
    flagged(TAMSIN, 19, CORVIN, 300_000_000, FLAG_ISK),
    flagged(TAMSIN, 4, ORRIN, -250_000_000),
    ...wallet(MIRA, 702, 23),
  ],
  contact: [
    ...contacts(TAMSIN, 212, 5),
    ...contacts(MIRA, 58, 6),
    ...contacts(HAULING, 19, 7),
    {
      key: 'c-corvin',
      characterId: TAMSIN.characterId,
      at: null,
      party: CORVIN,
      what: 'Contact',
      standing: 5,
    },
    {
      key: 'c-bk',
      characterId: TAMSIN.characterId,
      at: null,
      party: BLACK_KITE,
      what: 'Contact',
      standing: 0,
    },
  ],
  mail: [...mail(TAMSIN, 1284, 31), ...mail(MIRA, 188, 33), ...mail(HAULING, 37, 32)],
  contract: [
    ...contracts(TAMSIN, 236, 41),
    ...contracts(MIRA, 41, 42),
    ...contracts(HAULING, 2, 43),
  ],
  skills: [...skills(TAMSIN, 30, 51), ...skills(MIRA, 22, 52), ...skills(HAULING, 9, 53)],
  history: [...history(TAMSIN), ...history(MIRA), ...history(HAULING)],
};

export function rowsOf(source: SourceId, characterId: number | null): RawRow[] {
  return ROWS[source].filter((row) => characterId === null || row.characterId === characterId);
}

export const SOURCE_TYPES: Record<SourceId, string[]> = {
  wallet: [...new Set(WALLET_TYPES.map((t) => t.what))],
  contact: [],
  mail: ['Sent', 'Received'],
  contract: CONTRACT_TYPES,
  skills: [...new Set(SKILLS.map(([, group]) => group))],
  history: [],
};

export const PILOT_BY_ID = new Map(PILOTS.map((p) => [p.characterId, p]));
