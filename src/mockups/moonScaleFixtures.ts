/**
 * Fixtures for the Moon mining at scale mockup. One heavy Miner (Varro Kestane,
 * two characters) mining nearly every day since 1 Aug 2026 across 20 corp
 * moons and 60 pops, built from a seeded generator so every figure on every
 * screen is a sum of the same lines (no hand-typed totals to drift apart).
 *
 * Today is 18 Oct 2026 14:00 EVE; every day through 17 Oct is Billable. The
 * Aug Statement went out 1 Sep, the Sep Statement 1 Oct (due 15 Oct).
 */
export const TODAY_DAY = 78; // 18 Oct, counted from 1 Aug = 0
export const BILLABLE_THROUGH_DAY = 77; // 17 Oct
export const MEMBER_RATE = 10;

const MONTHS = ['Aug', 'Sep', 'Oct'] as const;
const MONTH_START = [0, 31, 61];

export type Month = (typeof MONTHS)[number];

export function dateOf(day: number): string {
  const m = day >= 61 ? 2 : day >= 31 ? 1 : 0;
  return `${day - MONTH_START[m] + 1} ${MONTHS[m]}`;
}
export function monthOf(day: number): Month {
  return MONTHS[day >= 61 ? 2 : day >= 31 ? 1 : 0];
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOON_NAMES: { moon: string; system: string; refinery: string }[] = [
  ['Efa V - Moon 3', 'Efa', 'Brass Anvil'],
  ['Efa VII - Moon 1', 'Efa', 'Copper Kiln'],
  ['Efa IX - Moon 4', 'Efa', 'Tin Cradle'],
  ['Kamela II - Moon 2', 'Kamela', 'Slag Heap'],
  ['Kamela II - Moon 5', 'Kamela', 'Slag Heap II'],
  ['Kamela IV - Moon 1', 'Kamela', 'Cinder Gate'],
  ['Hasmijaas III - Moon 2', 'Hasmijaas', 'Lode Star'],
  ['Hasmijaas III - Moon 6', 'Hasmijaas', 'Lode Star II'],
  ['Hasmijaas V - Moon 3', 'Hasmijaas', 'Deep Vein'],
  ['Ilmira I - Moon 1', 'Ilmira', 'Orrery'],
  ['Ilmira I - Moon 4', 'Ilmira', 'Orrery II'],
  ['Ilmira VI - Moon 2', 'Ilmira', 'Quarry Hall'],
  ['Tovil IV - Moon 3', 'Tovil', 'Brine Pit'],
  ['Tovil IV - Moon 7', 'Tovil', 'Brine Pit II'],
  ['Tovil VIII - Moon 1', 'Tovil', 'Salt Vault'],
  ['Qasmo II - Moon 2', 'Qasmo', 'Dust Reach'],
  ['Qasmo II - Moon 8', 'Qasmo', 'Dust Reach II'],
  ['Qasmo V - Moon 5', 'Qasmo', 'Far Bellows'],
  ['Neyra III - Moon 1', 'Neyra', 'Ember Dock'],
  ['Neyra III - Moon 3', 'Neyra', 'Ember Dock II'],
].map(([moon, system, refinery]) => ({ moon, system, refinery }));

const ORES = [
  { ore: 'Zeolites', price: 148.2 },
  { ore: 'Sylvite', price: 171.9 },
  { ore: 'Bitumens', price: 162.4 },
  { ore: 'Cobaltite', price: 412.75 },
  { ore: 'Euxenite', price: 455.1 },
  { ore: 'Scheelite', price: 238.6 },
];

export interface Pop {
  id: number;
  moonIndex: number;
  moon: string;
  system: string;
  refinery: string;
  /** Day the laser fired; the field is mined for the next two days. */
  fracture: number;
  ore: string;
  price: number;
  rate: number;
  dismissed: boolean;
}

export interface Line {
  id: number;
  popId: number;
  day: number;
  character: string;
  units: number;
  value: number;
  /** Tax at the pop's rate before any dismissal. */
  gross: number;
  tax: number;
}

export type PopStatus =
  | 'Paid'
  | 'Part paid'
  | 'On Aug Statement'
  | 'On Sep Statement'
  | 'Next Statement'
  | 'Not billable yet'
  | 'Dismissed';

export interface PopRow {
  pop: Pop;
  fractured: string;
  month: Month;
  lines: Line[];
  days: number;
  units: number;
  value: number;
  tax: number;
  /** Tax a dismissal removed (0 when none). */
  waived: number;
  /** Tax a lower pop rate removed against the book default. */
  rateCut: number;
  paid: number;
  owed: number;
  status: PopStatus;
}

const rand = rng(4056);

export const POPS: Pop[] = [];
MOON_NAMES.forEach((m, moonIndex) => {
  let fracture = 1 + ((moonIndex * 7) % 24);
  while (fracture < TODAY_DAY - 1) {
    let day = fracture;
    const dom = day - MONTH_START[day >= 61 ? 2 : day >= 31 ? 1 : 0];
    if (dom >= 28 && day < 61) day -= 3; // no pop straddles a month end
    const ore = ORES[(moonIndex + POPS.length) % ORES.length];
    POPS.push({
      id: POPS.length + 1,
      moonIndex,
      ...m,
      fracture: day,
      ore: ore.ore,
      price: ore.price,
      rate: MEMBER_RATE,
      dismissed: false,
    });
    fracture += 27 + Math.floor(rand() * 3);
  }
});

/** One-off exceptions the CEO made: a hauling op dismissed, one pop at a lower rate. */
const dismissedPop = POPS.find(
  (p) => p.moon === 'Kamela II - Moon 2' && monthOf(p.fracture) === 'Sep'
);
if (dismissedPop) dismissedPop.dismissed = true;
const rateCutPop = POPS.find((p) => p.moon === 'Efa VII - Moon 1' && monthOf(p.fracture) === 'Oct');
if (rateCutPop) rateCutPop.rate = 5;

const CHARACTERS = ['Varro Kestane', 'Lysa Kestane'];

export const LINES: Line[] = [];
for (let day = 0; day <= TODAY_DAY; day++) {
  for (const pop of POPS) {
    if (day < pop.fracture || day > pop.fracture + 1) continue;
    for (const character of CHARACTERS) {
      if (rand() < 0.08) continue;
      const units = Math.round((38_000 + rand() * 52_000) / 100) * 100;
      const value = Math.round(units * pop.price);
      LINES.push({
        id: LINES.length + 1,
        popId: pop.id,
        day,
        character,
        units,
        value,
        gross: Math.round((value * pop.rate) / 100),
        tax: pop.dismissed ? 0 : Math.round((value * pop.rate) / 100),
      });
    }
  }
}

const periodTax = (m: Month) =>
  LINES.filter((l) => monthOf(l.day) === m).reduce((t, l) => t + l.tax, 0);

const AUG_BILLED = periodTax('Aug');

const round4 = (n: number) => Math.round(n / 10_000) * 10_000;

export interface Payment {
  id: number;
  date: string;
  from: string;
  amount: number;
  /** Which Statement it settles, and the pops it reaches (oldest debt first). */
  statement: 'Aug Statement' | 'Sep Statement';
  covers: string;
  partial: boolean;
  popIds: number[];
}

const popTotals = new Map<
  number,
  { tax: number; paid: number; firstDay: number; lastDay: number }
>();
for (const pop of POPS) {
  const own = LINES.filter((l) => l.popId === pop.id);
  popTotals.set(pop.id, {
    tax: own.reduce((t, l) => t + l.tax, 0),
    paid: 0,
    firstDay: own[0]?.day ?? pop.fracture,
    lastDay: own[own.length - 1]?.day ?? pop.fracture,
  });
}

const billedPopsOldestFirst = POPS.filter(
  (p) => !p.dismissed && p.fracture <= 60 && popTotals.get(p.id)!.tax > 0
).sort((a, b) => a.fracture - b.fracture);

const taxOfPops = (pops: Pop[]) => pops.reduce((t, p) => t + popTotals.get(p.id)!.tax, 0);
const sepBilled = billedPopsOldestFirst.filter((p) => monthOf(p.fracture) === 'Sep');
const aug40 = round4(AUG_BILLED * 0.4);

/** Payments land on whole pops, except the last, which is part paid. */
const PAYMENT_PLAN: Omit<Payment, 'covers' | 'partial' | 'popIds'>[] = [
  { id: 1, date: '2 Sep', from: 'Lysa Kestane', amount: aug40, statement: 'Aug Statement' },
  {
    id: 2,
    date: '9 Sep',
    from: 'Varro Kestane',
    amount: AUG_BILLED - aug40,
    statement: 'Aug Statement',
  },
  {
    id: 3,
    date: '6 Oct',
    from: 'Varro Kestane',
    amount: taxOfPops(sepBilled.slice(0, 5)),
    statement: 'Sep Statement',
  },
  {
    id: 4,
    date: '16 Oct',
    from: 'Lysa Kestane',
    amount:
      taxOfPops(sepBilled.slice(5, 11)) +
      Math.round((popTotals.get(sepBilled[11].id)!.tax * 0.4) / 1000) * 1000,
    statement: 'Sep Statement',
  },
];

export const PAYMENTS: Payment[] = PAYMENT_PLAN.map((plan) => {
  let left = plan.amount;
  const reached: number[] = [];
  let partial = false;
  for (const pop of billedPopsOldestFirst) {
    const t = popTotals.get(pop.id)!;
    const room = t.tax - t.paid;
    if (room <= 0) continue;
    if (left <= 0) break;
    const take = Math.min(room, left);
    t.paid += take;
    left -= take;
    reached.push(pop.id);
    if (take < room) partial = true;
  }
  const first = POPS.find((p) => p.id === reached[0])!;
  const last = POPS.find((p) => p.id === reached[reached.length - 1])!;
  return {
    ...plan,
    partial,
    popIds: reached,
    covers: `${reached.length} pops, ${dateOf(first.fracture)} to ${dateOf(last.fracture)}${partial ? ', last one part' : ''}`,
  };
});

export function statusOf(pop: Pop, tax: number, paid: number): PopStatus {
  if (pop.dismissed) return 'Dismissed';
  const month = monthOf(pop.fracture);
  if (month === 'Oct') return pop.fracture + 1 >= TODAY_DAY ? 'Not billable yet' : 'Next Statement';
  if (paid >= tax) return 'Paid';
  if (paid > 0) return 'Part paid';
  return month === 'Aug' ? 'On Aug Statement' : 'On Sep Statement';
}

export const POP_ROWS: PopRow[] = POPS.filter((p) => LINES.some((l) => l.popId === p.id))
  .map((pop) => {
    const lines = LINES.filter((l) => l.popId === pop.id);
    const t = popTotals.get(pop.id)!;
    const tax = t.tax;
    const billed = !pop.dismissed && pop.fracture <= 60;
    const status = statusOf(pop, tax, t.paid);
    return {
      pop,
      fractured: dateOf(pop.fracture),
      month: monthOf(pop.fracture),
      lines,
      days: new Set(lines.map((l) => l.day)).size,
      units: lines.reduce((s, l) => s + l.units, 0),
      value: lines.reduce((s, l) => s + l.value, 0),
      tax,
      waived: lines.reduce((x, l) => x + l.gross - l.tax, 0),
      rateCut:
        pop.rate !== MEMBER_RATE
          ? Math.round((lines.reduce((x, l) => x + l.value, 0) * (MEMBER_RATE - pop.rate)) / 100)
          : 0,
      paid: t.paid,
      owed: billed ? tax - t.paid : 0,
      status,
    };
  })
  .sort((a, b) => b.pop.fracture - a.pop.fracture || a.pop.moon.localeCompare(b.pop.moon));

const sum = (rows: PopRow[], pick: (r: PopRow) => number) => rows.reduce((t, r) => t + pick(r), 0);

export const VARRO_TOTALS = {
  lines: LINES.length,
  days: new Set(LINES.map((l) => l.day)).size,
  moons: new Set(POP_ROWS.map((r) => r.pop.moonIndex)).size,
  pops: POP_ROWS.length,
  value: sum(POP_ROWS, (r) => r.value),
  tax: sum(POP_ROWS, (r) => r.tax),
  paid: sum(POP_ROWS, (r) => r.paid),
  owed: sum(POP_ROWS, (r) => r.owed),
  nextStatement: sum(
    POP_ROWS.filter((r) => r.status === 'Next Statement'),
    (r) => r.tax
  ),
  notBillable: sum(
    POP_ROWS.filter((r) => r.status === 'Not billable yet'),
    (r) => r.tax
  ),
  dismissed: POP_ROWS.filter((r) => r.status === 'Dismissed').length,
  waived: sum(POP_ROWS, (r) => r.waived),
  rateCut: sum(POP_ROWS, (r) => r.rateCut),
};

export const MONTH_STATEMENT: Record<Month, string> = {
  Aug: 'Statement sent 1 Sep',
  Sep: 'Statement sent 1 Oct, due 15 Oct',
  Oct: 'Not on a Statement yet',
};

/** A pop that Varro mined a lot of, for the Miner x Pop page. */
export const FOCUS_ROW = POP_ROWS.find(
  (r) => r.pop.moon === 'Efa V - Moon 3' && r.month === 'Sep'
)!;

// ------------------------------------------------------------------ Moon page

export interface PopMiner {
  miner: string;
  units: number;
  value: number;
  tax: number;
  paid: number;
  owed: number;
}

const OTHER = [
  'Odile Marchetti',
  'Tamsin Holloway',
  'Juno Rask',
  'Bram Oyelaran',
  'Ceda Vintner',
  'Marek Dols',
  'Ysolde Pryce',
  'Hakon Strand',
];

/** Everyone who mined the focus pop: Varro from his lines, the rest generated. */
export const FOCUS_MINERS: PopMiner[] = [
  {
    miner: 'Varro Kestane',
    units: FOCUS_ROW.units,
    value: FOCUS_ROW.value,
    tax: FOCUS_ROW.tax,
    paid: FOCUS_ROW.paid,
    owed: FOCUS_ROW.owed,
  },
  ...OTHER.map((miner, i) => {
    const units = 60_000 + Math.round(rand() * 220_000);
    const value = Math.round(units * FOCUS_ROW.pop.price);
    const tax = Math.round(value * 0.1);
    const paid = i % 3 === 0 ? tax : i % 3 === 1 ? Math.round(tax * 0.5) : 0;
    return { miner, units, value, tax, paid, owed: tax - paid };
  }),
];

export const FOCUS_TOTALS = {
  miners: FOCUS_MINERS.length,
  units: sum2(FOCUS_MINERS, (m) => m.units),
  value: sum2(FOCUS_MINERS, (m) => m.value),
  tax: sum2(FOCUS_MINERS, (m) => m.tax),
  paid: sum2(FOCUS_MINERS, (m) => m.paid),
  owed: sum2(FOCUS_MINERS, (m) => m.owed),
};

function sum2<T>(rows: T[], pick: (r: T) => number) {
  return rows.reduce((t, r) => t + pick(r), 0);
}

export interface MoonPop {
  pop: Pop;
  fractured: string;
  miners: number;
  minedPct: number;
  value: number;
  tax: number;
  paid: number;
  owed: number;
  status: PopStatus;
}

/** All pops of the focus moon, newest first; the focus pop's figures are the table above. */
export const MOON_POPS: MoonPop[] = POPS.filter((p) => p.moonIndex === FOCUS_ROW.pop.moonIndex)
  .sort((a, b) => b.fracture - a.fracture)
  .map((pop) => {
    if (pop.id === FOCUS_ROW.pop.id) {
      return {
        pop,
        fractured: dateOf(pop.fracture),
        miners: FOCUS_TOTALS.miners,
        minedPct: 93,
        value: FOCUS_TOTALS.value,
        tax: FOCUS_TOTALS.tax,
        paid: FOCUS_TOTALS.paid,
        owed: FOCUS_TOTALS.owed,
        status: FOCUS_ROW.status,
      };
    }
    const mineRows = POP_ROWS.find((r) => r.pop.id === pop.id);
    const scale = 6 + Math.round(rand() * 3);
    const value = (mineRows?.value ?? 0) * scale;
    const tax = Math.round(value * 0.1);
    const month = monthOf(pop.fracture);
    const settled = month === 'Aug';
    const paid = settled ? tax : month === 'Sep' ? Math.round(tax * 0.4) : 0;
    return {
      pop,
      fractured: dateOf(pop.fracture),
      miners: 9 + Math.round(rand() * 8),
      minedPct: 86 + Math.round(rand() * 10),
      value,
      tax,
      paid,
      owed: month === 'Oct' ? 0 : tax - paid,
      status: statusOf(pop, tax, paid),
    };
  });

export const MOON_TOTALS = {
  tax: sum2(MOON_POPS, (p) => p.tax),
  paid: sum2(MOON_POPS, (p) => p.paid),
  owed: sum2(MOON_POPS, (p) => p.owed),
  value: sum2(MOON_POPS, (p) => p.value),
  unbilled: sum2(
    MOON_POPS.filter((p) => p.status === 'Next Statement' || p.status === 'Not billable yet'),
    (p) => p.tax
  ),
};

// ------------------------------------------------------------------ Miners list

export interface ListMiner {
  main: string;
  standing: 'Member' | 'Guest';
  corp: string;
  owed: number;
  overdueDays: number | null;
  nextStatement: number;
  lastPaid: string;
  pops: number;
}

const NAMES = [
  'Varro Kestane',
  ...OTHER,
  'Isolde Marr',
  'Pell Dunmore',
  'Anselm Rowe',
  'Kit Vasquez',
  'Dorrin Hale',
  'Nessa Orlo',
  'Tobin Fray',
  'Wren Caldecott',
  'Edda Lindqvist',
  'Cass Mbeki',
  'Fenn Arkwright',
  'Sorrel Dane',
];

export const MIN_STATEMENT = 5_000_000;

export const LIST_MINERS: ListMiner[] = NAMES.map((main, i) => {
  if (i === 0) {
    return {
      main,
      standing: 'Member' as const,
      corp: 'Brass Meridian Logistics',
      owed: VARRO_TOTALS.owed,
      overdueDays: 3,
      nextStatement: VARRO_TOTALS.nextStatement,
      lastPaid: '16 Oct',
      pops: VARRO_TOTALS.pops,
    };
  }
  const big = i < 8;
  const owed = i % 4 === 0 ? 0 : Math.round(rand() * (big ? 90_000_000 : 20_000_000));
  const nextStatement = Math.round(
    rand() * (big ? 60_000_000 : i % 3 === 0 ? 4_000_000 : 18_000_000)
  );
  return {
    main,
    standing: i % 5 === 0 ? ('Guest' as const) : ('Member' as const),
    corp: i % 5 === 0 ? 'Ashfall Prospecting' : 'Brass Meridian Logistics',
    owed,
    overdueDays: owed > 0 && i % 2 === 0 ? 3 + ((i * 5) % 40) : null,
    nextStatement,
    lastPaid: owed === 0 ? `${2 + i} Oct` : i % 3 === 0 ? '2 Sep' : `${1 + i} Oct`,
    pops: big ? 20 + i : 3 + i,
  };
}).sort((a, b) => b.owed - a.owed);

export const LIST_TOTALS = {
  miners: 61,
  shown: LIST_MINERS.length,
  willBill: LIST_MINERS.filter((m) => m.nextStatement >= MIN_STATEMENT).length + 20,
  below:
    LIST_MINERS.filter((m) => m.nextStatement > 0 && m.nextStatement < MIN_STATEMENT).length + 14,
  overdue: LIST_MINERS.filter((m) => m.overdueDays !== null).length,
  owed: sum2(LIST_MINERS, (m) => m.owed) + 214_300_000,
  next: sum2(LIST_MINERS, (m) => m.nextStatement) + 380_100_000,
};
