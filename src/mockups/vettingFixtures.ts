/**
 * Sample data for the vetting mockups (applicant page and corp review).
 * One story throughout: 12 Nov 2026 16:00 EVE. Ashfall Logistics vets
 * applicants and reviews members before a promotion. Invented names only.
 */
import type { DeadlineSeverity } from '@/engine/character/severity';

export const CORP = { name: 'Ashfall Logistics', ticker: 'ASHFL' };

export type ReadState = 'read' | 'reading' | 'missing-scope' | 'ready' | 'needs-sign-in';

export interface VettingCharacter {
  name: string;
  corp: string;
  /** Character age and skill points, as the report's table shows them. */
  born: string;
  skillPoints: string;
  corps: number;
  state: ReadState;
  /** The Permission that was not shared, when `state` says one is missing. */
  missing?: string;
}

export const APPLICANT_CHARACTERS: VettingCharacter[] = [
  {
    name: 'Tamsin Vell',
    corp: 'Hollow Reach Mining',
    born: 'Mar 2019',
    skillPoints: '84.2M',
    corps: 6,
    state: 'read',
  },
  {
    name: 'Mira Vell',
    corp: 'Hollow Reach Mining',
    born: 'Jun 2021',
    skillPoints: '31.7M',
    corps: 2,
    state: 'missing-scope',
    missing: 'Mail',
  },
  {
    name: 'Vell Hauling',
    corp: 'Caldari Provisions',
    born: 'Jan 2024',
    skillPoints: '6.1M',
    corps: 1,
    state: 'read',
  },
];

export const MEMBER_CHARACTERS: VettingCharacter[] = [
  {
    name: 'Joss Arden',
    corp: CORP.name,
    born: 'Sep 2017',
    skillPoints: '142.0M',
    corps: 4,
    state: 'ready',
  },
  {
    name: 'Arden Ore',
    corp: CORP.name,
    born: 'Feb 2020',
    skillPoints: '48.3M',
    corps: 2,
    state: 'ready',
  },
  {
    name: 'Joss Arden II',
    corp: 'Arden Holdings',
    born: 'Nov 2022',
    skillPoints: '12.9M',
    corps: 1,
    state: 'needs-sign-in',
    missing: 'Mail',
  },
];

/** What a read covers, in the applicant's words. `note` narrows a line that would otherwise worry. */
export const READS: { label: string; note?: string }[] = [
  { label: 'Corporation history' },
  { label: 'Wallet journal and transactions', note: 'Last 30 days' },
  { label: 'Contacts and standings' },
  { label: 'Mail', note: 'Who and subject, never the message' },
  { label: 'Contracts' },
  { label: 'Assets and where they are' },
  { label: 'Skills' },
  { label: 'Jump clones' },
];

export interface EvidenceRow {
  at: string;
  who: string;
  whoNote?: string;
  what: string;
  amount?: string;
}

export interface Flag {
  id: string;
  severity: DeadlineSeverity;
  title: string;
  /** One sentence a recruiter can act on: who, what, how much, over how long. */
  finding: string;
  on: string;
  source: string;
  evidence: EvidenceRow[];
  /** Promotion reviews only: the flag did not exist at the last review. */
  isNew?: boolean;
}

export const FLAGS: Flag[] = [
  {
    id: 'hostile-isk',
    severity: 'critical',
    title: 'ISK from a watchlist corporation',
    finding: '1,200,000,000 ISK in 3 donations from Corvin Hale, Black Kite Syndicate (watchlist).',
    on: 'Tamsin Vell',
    source: 'Wallet journal',
    evidence: [
      {
        at: '9 Nov 21:14',
        who: 'Corvin Hale',
        whoNote: 'Black Kite Syndicate',
        what: 'Player donation',
        amount: '+500,000,000',
      },
      {
        at: '2 Nov 19:40',
        who: 'Corvin Hale',
        whoNote: 'Black Kite Syndicate',
        what: 'Player donation',
        amount: '+400,000,000',
      },
      {
        at: '24 Oct 22:03',
        who: 'Corvin Hale',
        whoNote: 'Black Kite Syndicate',
        what: 'Player donation',
        amount: '+300,000,000',
      },
    ],
  },
  {
    id: 'undeclared',
    severity: 'warning',
    title: 'Likely undeclared character',
    finding:
      'Orrin Dask: 9 wallet rows and 4 contracts with two of these characters. Not declared.',
    on: 'Tamsin Vell, Vell Hauling',
    source: 'Wallet journal, contracts',
    evidence: [
      { at: '10 Nov 18:22', who: 'Orrin Dask', what: 'Item exchange contract', amount: '0' },
      { at: '8 Nov 20:05', who: 'Orrin Dask', what: 'Player donation', amount: '-250,000,000' },
      { at: '3 Nov 17:51', who: 'Orrin Dask', what: 'Player donation', amount: '+90,000,000' },
    ],
  },
  {
    id: 'cyno',
    severity: 'warning',
    title: 'Cyno skills, no capital pilot declared',
    finding:
      'Cynosural Field Theory V, but no declared character flies a capital or black ops ship.',
    on: 'Tamsin Vell',
    source: 'Skills',
    evidence: [{ at: 'Trained', who: 'Tamsin Vell', what: 'Cynosural Field Theory V' }],
  },
];

export const PROMOTION_FLAGS: Flag[] = [
  {
    id: 'assets-out',
    severity: 'warning',
    title: 'Assets moved out of corp space',
    finding:
      '14,300,000,000 ISK of assets moved to Jita in 21 days. Nothing that size in the 6 months before.',
    on: 'Joss Arden',
    source: 'Assets, contracts',
    isNew: true,
    evidence: [
      {
        at: '6 Nov 19:10',
        who: 'Vell Freight',
        whoNote: 'Courier',
        what: 'Courier contract, 310,000 m3',
        amount: '9,800,000,000',
      },
      {
        at: '28 Oct 20:44',
        who: 'Vell Freight',
        whoNote: 'Courier',
        what: 'Courier contract, 140,000 m3',
        amount: '4,500,000,000',
      },
    ],
  },
];

export interface Check {
  name: string;
  detail: string;
}

/** The checks that ran and raised nothing, so "nothing found" is never a bare claim. */
export const CLEAR_CHECKS: Check[] = [
  {
    name: 'Corporation history',
    detail: '6 corporations, none on the watchlist, shortest stay 4 months',
  },
  { name: 'Contacts and standings', detail: '212 contacts, none on the watchlist' },
  { name: 'Kills on own corpmates', detail: 'None on zKillboard' },
  { name: 'Assets in watchlist space', detail: 'None' },
  { name: 'Jump clones in watchlist space', detail: 'None' },
  { name: 'Character age against skill points', detail: 'In the usual range for all 3' },
  { name: 'Contracts with the watchlist', detail: 'None in 38 contracts' },
];

export const MISSING_CHECKS: Check[] = [
  {
    name: 'Mail with the watchlist',
    detail: 'Mira Vell did not share Mail.',
  },
];

export type ReviewKind = 'Application' | 'Promotion';
export type ReviewResult = 'flags' | 'nothing' | 'incomplete' | 'waiting' | 'declined';

export interface Review {
  id: string;
  pilot: string;
  from: string;
  kind: ReviewKind;
  role?: string;
  characters: number;
  result: ReviewResult;
  flags: number;
  worst?: DeadlineSeverity;
  signed: number;
  needed: number;
  /** The viewer still owes a sign-off on this one. */
  yours?: boolean;
  read: string;
}

export const QUEUE: Review[] = [
  {
    id: 'V-0042',
    pilot: 'Tamsin Vell',
    from: 'Hollow Reach Mining',
    kind: 'Application',
    characters: 3,
    result: 'flags',
    flags: 3,
    worst: 'critical',
    signed: 0,
    needed: 1,
    yours: true,
    read: '2h ago',
  },
  {
    id: 'V-0041',
    pilot: 'Joss Arden',
    from: CORP.name,
    kind: 'Promotion',
    role: 'Director',
    characters: 3,
    result: 'flags',
    flags: 1,
    worst: 'warning',
    signed: 1,
    needed: 2,
    yours: true,
    read: '1d ago',
  },
  {
    id: 'V-0040',
    pilot: 'Pell Okonru',
    from: 'Science and Trade Institute',
    kind: 'Application',
    characters: 2,
    result: 'nothing',
    flags: 0,
    signed: 0,
    needed: 1,
    yours: true,
    read: '1d ago',
  },
  {
    id: 'V-0039',
    pilot: 'Dara Quill',
    from: 'Quill and Sons',
    kind: 'Application',
    characters: 1,
    result: 'incomplete',
    flags: 0,
    signed: 0,
    needed: 1,
    yours: true,
    read: '3d ago',
  },
  {
    id: 'V-0038',
    pilot: 'Ren Halvard',
    from: CORP.name,
    kind: 'Promotion',
    role: 'Accountant',
    characters: 0,
    result: 'waiting',
    flags: 0,
    signed: 0,
    needed: 2,
    read: 'Asked 2d ago',
  },
];

export interface SignOff {
  who: string;
  role: string;
  state: 'you' | 'hidden' | 'barred' | 'open';
  note: string;
}

export const APPLICATION_SIGNOFFS: SignOff[] = [
  { who: 'You', role: 'Kestrel Vane, Director', state: 'you', note: 'Not decided' },
];

export const PROMOTION_SIGNOFFS: SignOff[] = [
  {
    who: 'Ilse Marrow',
    role: 'CEO',
    state: 'hidden',
    note: 'Decided 11 Nov. Hidden until you decide',
  },
  { who: 'You', role: 'Kestrel Vane, Director', state: 'you', note: 'Not decided' },
  {
    who: 'Bram Soto',
    role: 'Director',
    state: 'barred',
    note: 'Asked for this review',
  },
];

export const SINCE_LAST: { label: string; value: string; note?: string }[] = [
  { label: 'Characters', value: '3', note: '1 added since: Joss Arden II' },
  { label: 'New counterparties over 100M ISK', value: '2', note: 'Neither on the watchlist' },
  { label: 'New flags', value: '1' },
  { label: 'Flags gone', value: '0' },
];

export const IN_CORP: { label: string; value: string; note?: string }[] = [
  { label: 'Member for', value: '8 months', note: 'Joined 14 Mar 2026' },
  { label: 'Mining tax', value: '6 of 6 statements paid', note: 'Latest paid 2 days early' },
  { label: 'SRP claims', value: '4', note: '3 paid, 1 rejected (not a fleet loss)' },
  { label: 'Days mined on corp moons', value: '41' },
];

export const VIEW_LOG: { at: string; actor: string; text: string }[] = [
  { at: '12 Nov 15:58', actor: 'Kestrel Vane', text: 'opened the report' },
  { at: '12 Nov 14:02', actor: 'Tamsin Vell', text: 'shared 3 characters' },
  { at: '12 Nov 13:41', actor: 'Tamsin Vell', text: 'opened the apply link' },
];
