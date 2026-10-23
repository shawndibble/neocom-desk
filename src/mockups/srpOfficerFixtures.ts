/** Sample SRP claims for the officer mockups. Today is 23 Oct 2026, 14:00 EVE. Not shared with other mockups. */

export type SrpState = 'Pending' | 'Approved' | 'Paid' | 'Rejected';

export type SrpBasis =
  | 'Hull Rule: fixed'
  | 'Killmail value x 70%'
  | 'Jita appraisal x 60%'
  | 'No amount: officer types it';

export interface SrpClaim {
  id: string;
  pilot: string;
  hull: string;
  killmailId: number;
  system: string;
  lostAt: string;
  filedAt: string;
  note?: string;
  /** What the server worked out; null = officer types it. */
  computed: number | null;
  basis: SrpBasis;
  /** Amount in force after an override, else the computed one. */
  amount: number | null;
  overrideReason?: string;
  overrideBy?: string;
  state: SrpState;
  decidedBy?: string;
  decidedAt?: string;
  rejectReason?: string;
  paidAt?: string;
}

export const OFFICER = { name: 'Kestrel Vane', role: 'Director' };

export const PENDING: SrpClaim[] = [
  {
    id: 'SRP-0418',
    pilot: 'Varro Kestane',
    hull: 'Gila',
    killmailId: 131_204_551,
    system: 'Tama',
    lostAt: '22 Oct 21:14',
    filedAt: '22 Oct 22:02',
    note: 'Roam, FC Dax Orlenn',
    computed: 250_000_000,
    basis: 'Hull Rule: fixed',
    amount: 250_000_000,
    state: 'Pending',
  },
  {
    id: 'SRP-0419',
    pilot: 'Lysa Kestane',
    hull: 'Hurricane Fleet Issue',
    killmailId: 131_207_880,
    system: 'Amamake',
    lostAt: '22 Oct 23:40',
    filedAt: '23 Oct 00:15',
    computed: 65_975_000,
    basis: 'Killmail value x 70%',
    amount: 65_975_000,
    state: 'Pending',
  },
  {
    id: 'SRP-0420',
    pilot: 'Tamsin Vell',
    hull: 'Nightmare',
    killmailId: 131_212_063,
    system: 'Rancer',
    lostAt: '23 Oct 08:31',
    filedAt: '23 Oct 09:10',
    note: 'Home defence, FC Mira Sol',
    computed: 367_440_000,
    basis: 'Jita appraisal x 60%',
    amount: 367_440_000,
    state: 'Pending',
  },
  {
    id: 'SRP-0421',
    pilot: 'Orrin Tace',
    hull: 'Orthrus',
    killmailId: 131_213_902,
    system: 'Otela',
    lostAt: '23 Oct 10:05',
    filedAt: '23 Oct 10:48',
    computed: 80_000_000,
    basis: 'Hull Rule: fixed',
    amount: 80_000_000,
    state: 'Pending',
  },
  {
    id: 'SRP-0422',
    pilot: 'Bex Hallow',
    hull: 'Vexor Navy Issue',
    killmailId: 131_215_447,
    system: 'Kisogo',
    lostAt: '23 Oct 11:52',
    filedAt: '23 Oct 12:30',
    computed: null,
    basis: 'No amount: officer types it',
    amount: null,
    state: 'Pending',
  },
];

export const APPROVED: SrpClaim[] = [
  {
    id: 'SRP-0412',
    pilot: 'Dax Orlenn',
    hull: 'Gila',
    killmailId: 131_190_338,
    system: 'Tama',
    lostAt: '21 Oct 20:03',
    filedAt: '21 Oct 20:40',
    computed: 250_000_000,
    basis: 'Hull Rule: fixed',
    amount: 250_000_000,
    state: 'Approved',
    decidedBy: 'Kestrel Vane',
    decidedAt: '22 Oct 09:12',
  },
  {
    id: 'SRP-0414',
    pilot: 'Mira Sol',
    hull: 'Rifter',
    killmailId: 131_196_021,
    system: 'Efa',
    lostAt: '22 Oct 01:18',
    filedAt: '22 Oct 06:44',
    computed: 11_970_000,
    basis: 'Killmail value x 70%',
    amount: 11_970_000,
    state: 'Approved',
    decidedBy: 'Kestrel Vane',
    decidedAt: '22 Oct 09:13',
  },
  {
    id: 'SRP-0415',
    pilot: 'Joss Ferrin',
    hull: 'Muninn',
    killmailId: 131_198_774,
    system: 'Amamake',
    lostAt: '22 Oct 12:27',
    filedAt: '22 Oct 13:01',
    note: 'Home defence, FC Dax Orlenn',
    computed: 140_000_000,
    basis: 'Killmail value x 70%',
    amount: 110_000_000,
    overrideReason: 'Fit had no faction modules; killmail value was inflated by cargo',
    overrideBy: 'Kestrel Vane',
    state: 'Approved',
    decidedBy: 'Kestrel Vane',
    decidedAt: '22 Oct 15:30',
  },
];

export const HISTORY: SrpClaim[] = [
  {
    id: 'SRP-0409',
    pilot: 'Orrin Tace',
    hull: 'Rifter',
    killmailId: 131_171_902,
    system: 'Efa',
    lostAt: '19 Oct 18:44',
    filedAt: '19 Oct 19:20',
    computed: 9_800_000,
    basis: 'Killmail value x 70%',
    amount: 9_800_000,
    state: 'Paid',
    decidedBy: 'Kestrel Vane',
    decidedAt: '20 Oct 08:05',
    paidAt: '20 Oct 08:11',
  },
  {
    id: 'SRP-0410',
    pilot: 'Varro Kestane',
    hull: 'Gila',
    killmailId: 131_175_330,
    system: 'Tama',
    lostAt: '19 Oct 22:10',
    filedAt: '20 Oct 07:02',
    note: 'Roam, FC Dax Orlenn',
    computed: 250_000_000,
    basis: 'Hull Rule: fixed',
    amount: 250_000_000,
    state: 'Paid',
    decidedBy: 'Kestrel Vane',
    decidedAt: '20 Oct 08:06',
    paidAt: '20 Oct 08:14',
  },
  {
    id: 'SRP-0411',
    pilot: 'Bex Hallow',
    hull: 'Tristan',
    killmailId: 131_180_118,
    system: 'Kisogo',
    lostAt: '20 Oct 14:55',
    filedAt: '20 Oct 15:30',
    note: 'Solo roam',
    computed: 1_900_000,
    basis: 'Jita appraisal x 60%',
    amount: 1_900_000,
    state: 'Rejected',
    decidedBy: 'Lena Maro',
    decidedAt: '21 Oct 10:02',
    rejectReason: 'Solo roam, not a corp fleet. SRP covers corp doctrine fleets only.',
  },
  {
    id: 'SRP-0413',
    pilot: 'Tamsin Vell',
    hull: 'Gila',
    killmailId: 131_190_338,
    system: 'Tama',
    lostAt: '21 Oct 20:03',
    filedAt: '22 Oct 07:15',
    computed: 250_000_000,
    basis: 'Hull Rule: fixed',
    amount: 250_000_000,
    state: 'Rejected',
    decidedBy: 'Kestrel Vane',
    decidedAt: '22 Oct 09:14',
    rejectReason: 'Duplicate of SRP-0412: same killmail.',
  },
];

export interface ActivityEntry {
  at: string;
  actor: string;
  text: string;
}

export const ACTIVITY: ActivityEntry[] = [
  {
    at: '22 Oct 15:30',
    actor: 'Kestrel Vane',
    text: 'Approved SRP-0415 for 110,000,000 ISK (overridden from 140,000,000)',
  },
  { at: '22 Oct 09:14', actor: 'Kestrel Vane', text: 'Rejected SRP-0413: duplicate of SRP-0412' },
  { at: '22 Oct 09:13', actor: 'Kestrel Vane', text: 'Approved SRP-0414 for 11,970,000 ISK' },
  { at: '22 Oct 09:12', actor: 'Kestrel Vane', text: 'Approved SRP-0412 for 250,000,000 ISK' },
  {
    at: '21 Oct 10:02',
    actor: 'Lena Maro',
    text: 'Rejected SRP-0411: solo roam, not a corp fleet',
  },
  { at: '20 Oct 08:14', actor: 'Kestrel Vane', text: 'Marked SRP-0410 paid, 250,000,000 ISK' },
  { at: '20 Oct 08:11', actor: 'Kestrel Vane', text: 'Marked SRP-0409 paid, 9,800,000 ISK' },
];

export interface AuditEntry {
  at: string;
  actor: string;
  text: string;
}

export const AUDIT_OVERRIDDEN: AuditEntry[] = [
  {
    at: '22 Oct 15:30',
    actor: 'Kestrel Vane',
    text: 'Approved at 110,000,000 ISK. Mail sent to Joss Ferrin.',
  },
  {
    at: '22 Oct 15:29',
    actor: 'Kestrel Vane',
    text: 'Changed amount 140,000,000 to 110,000,000 ISK: Fit had no faction modules; killmail value was inflated by cargo',
  },
  {
    at: '22 Oct 13:02',
    actor: 'System',
    text: 'Killmail 131198774 verified: Joss Ferrin lost a Muninn at Amamake. Amount worked out: 140,000,000 ISK (Killmail value x 70%).',
  },
  { at: '22 Oct 13:01', actor: 'Joss Ferrin', text: 'Filed the claim' },
];

export const AUDIT_PENDING: AuditEntry[] = [
  {
    at: '22 Oct 22:03',
    actor: 'System',
    text: 'Killmail 131204551 verified: Varro Kestane lost a Gila at Tama. Amount worked out: 250,000,000 ISK (Hull Rule: fixed).',
  },
  { at: '22 Oct 22:02', actor: 'Varro Kestane', text: 'Filed the claim' },
];

export const sum = (claims: SrpClaim[]) =>
  claims.reduce((total, claim) => total + (claim.amount ?? 0), 0);
