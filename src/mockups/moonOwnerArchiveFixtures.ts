export const OWNER = 'Ashfall Mining Collective';
export const ACCOUNTING = 'Brass Meridian Logistics';

export interface MinedRow {
  id: string;
  miner: string;
  station: string;
  ore: string;
  units: number;
  value: number;
}

export const MINED: MinedRow[] = [
  {
    id: '3:11',
    miner: 'Odile Marchetti',
    station: 'Ashfall Athanor II',
    ore: 'Zeolites, Sylvite',
    units: 801_150,
    value: 152_430_000,
  },
  {
    id: '1:10',
    miner: 'Varro Kestane',
    station: 'Efa - Ashfall Tatara',
    ore: 'Zeolites, Sylvite',
    units: 412_300,
    value: 81_204_000,
  },
  {
    id: '2:10',
    miner: 'Tamsin Holloway',
    station: 'Efa - Ashfall Tatara',
    ore: 'Bitumens',
    units: 290_800,
    value: 58_960_000,
  },
  {
    id: '4:11',
    miner: 'Juno Rask',
    station: 'Ashfall Athanor II',
    ore: 'Bitumens',
    units: 118_400,
    value: 45_800_000,
  },
];

export type OfferReason = 'gone' | 'idle' | null;

export interface Station {
  id: number;
  name: string;
  moon: string;
  extractions: number;
  mined: number;
  lastExtraction: string;
  lastMined: string;
  offer: OfferReason;
  idleDays?: number;
  archivedBy?: string;
  archivedOn?: string;
  archivedWhy?: string;
}

export const ACTIVE_STATION: Station = {
  id: 10,
  name: 'Efa - Ashfall Tatara',
  moon: 'Efa V - Moon 3',
  extractions: 14,
  mined: 140_164_000,
  lastExtraction: '14 Nov',
  lastMined: '15 Nov',
  offer: null,
};

export const IDLE_STATION: Station = {
  id: 11,
  name: 'Ashfall Athanor II',
  moon: 'Jita IV - Moon 4',
  extractions: 9,
  mined: 198_230_000,
  lastExtraction: '6 Sep',
  lastMined: '19 Sep',
  offer: 'idle',
  idleDays: 71,
};

export const GONE_STATION: Station = {
  id: 12,
  name: 'Kestrel Drill 04',
  moon: 'Perimeter II - Moon 1',
  extractions: 6,
  mined: 44_920_000,
  lastExtraction: '22 Aug',
  lastMined: '30 Aug',
  offer: 'gone',
};

export const ARCHIVED: Station[] = [
  {
    id: 20,
    name: 'Old Ashfall Athanor',
    moon: 'Efa IV - Moon 2',
    extractions: 11,
    mined: 96_400_000,
    lastExtraction: '3 Jul',
    lastMined: '9 Jul',
    offer: null,
    archivedBy: 'Mira Valdane',
    archivedOn: '2 Nov',
    archivedWhy: 'Gone in the game',
  },
  {
    id: 21,
    name: 'Nullsec Test Refinery',
    moon: 'Perimeter I - Moon 6',
    extractions: 2,
    mined: 3_100_000,
    lastExtraction: '18 May',
    lastMined: '21 May',
    offer: null,
    archivedBy: 'Tobias Renk',
    archivedOn: '9 Oct',
    archivedWhy: 'By hand',
  },
];

export interface ExtractionRow {
  id: string;
  popped: string;
  state: 'Ready' | 'Fractured' | 'Expired';
  ore: string;
  estIsk: number;
  fullyMined: boolean;
}

export const EXTRACTIONS: ExtractionRow[] = [
  {
    id: 'e5',
    popped: '14 Nov',
    state: 'Ready',
    ore: 'Zeolites 61%, Sylvite 39%',
    estIsk: 118_400_000,
    fullyMined: false,
  },
  {
    id: 'e4',
    popped: '31 Oct',
    state: 'Fractured',
    ore: 'Bitumens 70%, Coesite 30%',
    estIsk: 96_000_000,
    fullyMined: true,
  },
  {
    id: 'e3',
    popped: '17 Oct',
    state: 'Expired',
    ore: 'Zeolites 55%, Sylvite 45%',
    estIsk: 104_200_000,
    fullyMined: false,
  },
  {
    id: 'e2',
    popped: '3 Oct',
    state: 'Fractured',
    ore: 'Bitumens 80%, Coesite 20%',
    estIsk: 88_700_000,
    fullyMined: true,
  },
];

export interface HistoryRow {
  id: string;
  month: string;
  miners: number;
  units: number;
  value: number;
}

export const HISTORY: HistoryRow[] = [
  { id: 'h11', month: 'Nov 2026', miners: 4, units: 322_000, value: 61_240_000 },
  { id: 'h10', month: 'Oct 2026', miners: 6, units: 1_104_300, value: 214_880_000 },
  { id: 'h09', month: 'Sep 2026', miners: 5, units: 689_000, value: 131_050_000 },
  { id: 'h08', month: 'Aug 2026', miners: 3, units: 402_500, value: 77_600_000 },
];
