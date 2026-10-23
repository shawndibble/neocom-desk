/** Sample data for the SRP member mockups. Today is 23 Oct 2026, 14:00 EVE. */
export const SRP_PHONE = { viewport: { value: 'phone390', isRotated: false } };

export const SRP_PARAMS = {
  layout: 'fullscreen',
  shell: {
    // /corp/srp is not a route yet, so the shell borrows a real corp route for its chrome.
    path: '/corp/moons',
    scopes: [
      'esi-wallet.read_character_wallet.v1',
      'esi-characters.read_loyalty.v1',
      'esi-characters.read_standings.v1',
    ],
  },
};

export type ClaimState = 'Pending' | 'Approved' | 'Paid' | 'Rejected';

export interface Claim {
  id: string;
  hull: string;
  system: string;
  lostAt: string;
  state: ClaimState;
  /** ISK; null = the hull rule is "Officer decides" and no amount is set yet. */
  amount: number | null;
  filed: string;
  reason?: string;
  /** A rejected claim can be re-filed once; true once it has been. */
  refiled?: boolean;
}

export const CLAIMS: Claim[] = [
  {
    id: 'c1',
    hull: 'Cerberus',
    system: 'Ignoitton',
    lostAt: '21 Oct, 19:42',
    state: 'Pending',
    amount: null,
    filed: '22 Oct',
  },
  {
    id: 'c2',
    hull: 'Gila',
    system: 'Raravoss',
    lostAt: '19 Oct, 02:15',
    state: 'Approved',
    amount: 156_000_000,
    filed: '19 Oct',
  },
  {
    id: 'c3',
    hull: 'Vexor Navy Issue',
    system: 'Kamela',
    lostAt: '11 Oct, 21:03',
    state: 'Paid',
    amount: 98_500_000,
    filed: '12 Oct',
  },
  {
    id: 'c4',
    hull: 'Ferox',
    system: 'Aphi',
    lostAt: '8 Oct, 17:30',
    state: 'Rejected',
    amount: 61_200_000,
    filed: '9 Oct',
    reason: 'Not a fleet loss: no FC listed and the kill was a solo roam.',
  },
  {
    id: 'c5',
    hull: 'Stabber',
    system: 'Aphi',
    lostAt: '3 Oct, 12:11',
    state: 'Rejected',
    amount: 9_800_000,
    filed: '4 Oct',
    refiled: true,
    reason: 'Hull was fit with a faction module outside the doctrine.',
  },
];

export interface LostShip {
  id: string;
  hull: string;
  system: string;
  lostAt: string;
  ageDays: number;
  value: number;
  kind: 'open' | 'claimed' | 'old' | 'notCovered';
}

export const LOST_SHIPS: LostShip[] = [
  {
    id: 'l1',
    hull: 'Hurricane Fleet Issue',
    system: 'Ignoitton',
    lostAt: '22 Oct, 20:05',
    ageDays: 1,
    value: 187_000_000,
    kind: 'open',
  },
  {
    id: 'l2',
    hull: 'Cerberus',
    system: 'Ignoitton',
    lostAt: '21 Oct, 19:42',
    ageDays: 2,
    value: 142_000_000,
    kind: 'claimed',
  },
  {
    id: 'l3',
    hull: 'Gila',
    system: 'Raravoss',
    lostAt: '19 Oct, 02:15',
    ageDays: 4,
    value: 210_000_000,
    kind: 'claimed',
  },
  {
    id: 'l4',
    hull: 'Caracal',
    system: 'Aphi',
    lostAt: '14 Oct, 18:40',
    ageDays: 9,
    value: 24_300_000,
    kind: 'open',
  },
  {
    id: 'l5',
    hull: 'Capsule',
    system: 'Aphi',
    lostAt: '14 Oct, 18:40',
    ageDays: 9,
    value: 0,
    kind: 'notCovered',
  },
  {
    id: 'l6',
    hull: 'Rifter',
    system: 'Kamela',
    lostAt: '19 Sep, 16:22',
    ageDays: 34,
    value: 1_900_000,
    kind: 'old',
  },
  {
    id: 'l7',
    hull: 'Thorax',
    system: 'Kamela',
    lostAt: '12 Sep, 09:50',
    ageDays: 41,
    value: 8_600_000,
    kind: 'old',
  },
];
