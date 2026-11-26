export type PopState = 'extracting' | 'ready' | 'fractured' | 'expired' | 'cancelled';

export interface OreShare {
  ore: string;
  units: number;
  mined: number;
}

export interface Pop {
  id: string;
  state: PopState;
  started: string;
  pop: string;
  fractured?: string;
  by?: 'laser' | 'auto';
  fieldGone?: string;
  cancelledOn?: string;
  ore: OreShare[];
  estIsk: number | null;
  minedPct: number | null;
  miners: number;
  tax: number;
  fullyMined?: boolean;
  topMiners: { name: string; isk: number }[];
}

export interface MoonRow {
  id: string;
  moon: string;
  refinery: string;
  owner: string;
  archived?: boolean;
  unknownMoon?: boolean;
  newest: PopState | null;
  nextPop?: string;
  lastPop?: string;
  pops: number;
  minedIsk: number;
  tax: number;
}

export const BOOK_CORP = 'Brass Anvil Mining';

export const MOONS: MoonRow[] = [
  {
    id: 'm1',
    moon: 'Efa V - Moon 3',
    refinery: 'Efa V - Brass Anvil',
    owner: BOOK_CORP,
    newest: 'extracting',
    nextPop: '19 Nov 14:12',
    lastPop: '9 Nov 11:40',
    pops: 14,
    minedIsk: 4_812_000_000,
    tax: 481_200_000,
  },
  {
    id: 'm2',
    moon: 'Efa VII - Moon 1',
    refinery: 'Efa VII - Copper Kiln',
    owner: BOOK_CORP,
    newest: 'ready',
    nextPop: '16 Nov 09:05',
    lastPop: '2 Nov 16:20',
    pops: 11,
    minedIsk: 3_377_000_000,
    tax: 337_700_000,
  },
  {
    id: 'm3',
    moon: 'Kamela II - Moon 2',
    refinery: 'Kamela II - Slag Heap',
    owner: BOOK_CORP,
    newest: 'fractured',
    lastPop: '14 Nov 18:31',
    pops: 9,
    minedIsk: 2_104_000_000,
    tax: 210_400_000,
  },
  {
    id: 'm4',
    moon: 'Kamela II - Moon 5',
    refinery: 'Kamela II - Slag Heap',
    owner: BOOK_CORP,
    newest: 'extracting',
    nextPop: '22 Nov 07:48',
    lastPop: '8 Nov 20:03',
    pops: 12,
    minedIsk: 3_950_000_000,
    tax: 395_000_000,
  },
  {
    id: 'm5',
    moon: 'Hasmijaas III - Moon 2',
    refinery: 'Hasmijaas III - Lode Star',
    owner: 'Tallow Station Co',
    newest: 'extracting',
    nextPop: '18 Nov 22:15',
    lastPop: '5 Nov 13:10',
    pops: 7,
    minedIsk: 1_660_000_000,
    tax: 149_400_000,
  },
  {
    id: 'm6',
    moon: 'Hasmijaas III - Moon 6',
    refinery: 'Hasmijaas III - Lode Star',
    owner: 'Tallow Station Co',
    newest: 'expired',
    lastPop: '28 Oct 10:30',
    pops: 6,
    minedIsk: 920_000_000,
    tax: 82_800_000,
  },
  {
    id: 'm7',
    moon: 'Ilmira I - Moon 1',
    refinery: 'Ilmira I - Orrery',
    owner: 'Wren Hollow Ltd',
    newest: 'fractured',
    lastPop: '13 Nov 06:55',
    pops: 10,
    minedIsk: 2_720_000_000,
    tax: 217_600_000,
  },
  {
    id: 'm8',
    moon: 'Ilmira I - Moon 4',
    refinery: 'Ilmira I - Orrery II',
    owner: 'Wren Hollow Ltd',
    newest: 'cancelled',
    lastPop: '21 Oct 15:00',
    pops: 5,
    minedIsk: 610_000_000,
    tax: 48_800_000,
  },
  {
    id: 'm9',
    moon: 'Tovil IV - Moon 3',
    refinery: 'Tovil IV - Brine Pit',
    owner: BOOK_CORP,
    newest: 'extracting',
    nextPop: '24 Nov 12:00',
    lastPop: '10 Nov 08:20',
    pops: 16,
    minedIsk: 5_240_000_000,
    tax: 524_000_000,
  },
  {
    id: 'm10',
    moon: 'Tovil VIII - Moon 1',
    refinery: 'Tovil VIII - Salt Vault',
    owner: BOOK_CORP,
    newest: 'expired',
    lastPop: '26 Oct 19:42',
    pops: 8,
    minedIsk: 1_390_000_000,
    tax: 139_000_000,
  },
  {
    id: 'm11',
    moon: 'Qasmo II - Moon 2',
    refinery: 'Qasmo II - Dust Reach',
    owner: BOOK_CORP,
    archived: true,
    newest: 'expired',
    lastPop: '3 Sep 11:11',
    pops: 4,
    minedIsk: 780_000_000,
    tax: 78_000_000,
  },
  {
    id: 'm12',
    moon: 'Qasmo V - Moon 5',
    refinery: 'Qasmo V - Far Bellows',
    owner: 'Tallow Station Co',
    archived: true,
    newest: 'cancelled',
    lastPop: '17 Aug 09:30',
    pops: 3,
    minedIsk: 215_000_000,
    tax: 17_200_000,
  },
  {
    id: 'm13',
    moon: 'Moon not known yet',
    refinery: 'Neyra III - Ember Dock',
    owner: 'Wren Hollow Ltd',
    unknownMoon: true,
    newest: null,
    pops: 0,
    minedIsk: 0,
    tax: 0,
  },
];

const R4 = (ore: string, units: number, mined: number): OreShare => ({ ore, units, mined });

export const OPEN_MOON = {
  ...MOONS[0],
  system: 'Efa',
  popRows: [
    {
      id: 'p14',
      state: 'extracting',
      started: '12 Nov',
      pop: '19 Nov 14:12',
      fieldGone: 'about 22 Nov 14:12',
      ore: [
        R4('Xenotime', 1_900_000, 0),
        R4('Monazite', 1_300_000, 0),
        R4('Cobaltite', 800_000, 0),
      ],
      estIsk: 521_000_000,
      minedPct: null,
      miners: 0,
      tax: 0,
      topMiners: [],
    },
    {
      id: 'p13',
      state: 'fractured',
      started: '2 Nov',
      pop: '9 Nov 11:40',
      fractured: '9 Nov 11:52',
      by: 'laser',
      fieldGone: 'about 12 Nov 11:40',
      ore: [
        R4('Xenotime', 2_100_000, 1_860_000),
        R4('Monazite', 1_200_000, 1_040_000),
        R4('Cobaltite', 700_000, 590_000),
      ],
      estIsk: 498_000_000,
      minedPct: 87,
      miners: 23,
      tax: 43_300_000,
      fullyMined: true,
      topMiners: [
        { name: 'Varro Kestane', isk: 61_000_000 },
        { name: 'Mira Soltane', isk: 48_000_000 },
        { name: 'Dax Orrell', isk: 41_000_000 },
      ],
    },
    {
      id: 'p12',
      state: 'expired',
      started: '26 Oct',
      pop: '2 Nov 16:20',
      fractured: '2 Nov 19:20',
      by: 'auto',
      fieldGone: '5 Nov 19:20',
      ore: [
        R4('Xenotime', 1_800_000, 720_000),
        R4('Monazite', 1_400_000, 510_000),
        R4('Cobaltite', 900_000, 330_000),
      ],
      estIsk: 477_000_000,
      minedPct: 41,
      miners: 9,
      tax: 19_600_000,
      topMiners: [
        { name: 'Mira Soltane', isk: 52_000_000 },
        { name: 'Varro Kestane', isk: 38_000_000 },
        { name: 'Tess Arkwright', isk: 24_000_000 },
      ],
    },
    {
      id: 'p11',
      state: 'cancelled',
      started: '21 Oct',
      pop: '28 Oct 08:00',
      cancelledOn: '24 Oct',
      ore: [R4('Xenotime', 2_000_000, 0), R4('Monazite', 1_000_000, 0)],
      estIsk: 455_000_000,
      minedPct: null,
      miners: 0,
      tax: 0,
      topMiners: [],
    },
    {
      id: 'p10',
      state: 'expired',
      started: '14 Oct',
      pop: '21 Oct 13:05',
      fractured: '21 Oct 13:25',
      by: 'laser',
      fieldGone: '24 Oct 13:25',
      ore: [],
      estIsk: null,
      minedPct: null,
      miners: 14,
      tax: 28_100_000,
      topMiners: [
        { name: 'Varro Kestane', isk: 44_000_000 },
        { name: 'Dax Orrell', isk: 36_000_000 },
        { name: 'Mira Soltane', isk: 31_000_000 },
      ],
    },
    {
      id: 'p9',
      state: 'expired',
      started: '6 Oct',
      pop: '13 Oct 10:30',
      fractured: '13 Oct 13:30',
      by: 'auto',
      fieldGone: '16 Oct 13:30',
      ore: [R4('Xenotime', 2_200_000, 1_980_000), R4('Monazite', 1_100_000, 990_000)],
      estIsk: 530_000_000,
      minedPct: 90,
      miners: 19,
      tax: 47_700_000,
      fullyMined: true,
      topMiners: [
        { name: 'Varro Kestane', isk: 70_000_000 },
        { name: 'Mira Soltane', isk: 55_000_000 },
        { name: 'Tess Arkwright', isk: 46_000_000 },
      ],
    },
  ] satisfies Pop[],
};

export const EMPTY_MOON = {
  id: 'm14',
  moon: 'Neyra III - Moon 3',
  system: 'Neyra',
  refinery: 'Neyra III - Ember Dock II',
  owner: 'Wren Hollow Ltd',
  bookStart: '9 Nov 2026',
  live: {
    id: 'p1',
    state: 'extracting',
    started: '11 Nov',
    pop: '18 Nov 21:30',
    fieldGone: 'about 21 Nov 21:30',
    ore: [R4('Bitumens', 1_600_000, 0), R4('Zeolites', 1_100_000, 0), R4('Sylvite', 900_000, 0)],
    estIsk: 188_000_000,
    minedPct: null,
    miners: 0,
    tax: 0,
    topMiners: [],
  } satisfies Pop,
};
