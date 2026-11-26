import { CHARACTER_ID, CHARACTER_NAME, CORPORATION_ID, OWNER_HASH } from '../fixtureData';

export const OFFICER = { id: CHARACTER_ID, name: CHARACTER_NAME, ownerHash: OWNER_HASH };
export const CORP = CORPORATION_ID;
export const OUTSIDE_CORP = 98_999_999;
export const OTHER_CORP = 98_000_002;
const LEFT_FROM = 90_008_000;
const OUTSIDE_FROM = 90_009_000;

export const MINER = {
  ada: { id: 90_000_101, name: 'Ada Lunar' },
  bram: { id: 90_000_102, name: 'Bram Kessik' },
  cora: { id: 90_000_103, name: 'Cora Vell' },
  dax: { id: 90_000_104, name: 'Dax Orlov' },
  daxAlt: { id: 90_000_105, name: 'Orlov Hauler' },
  eli: { id: 90_000_106, name: 'Eli Brask' },
  fen: { id: 90_000_107, name: 'Fen Corvane' },
  pilotAlt: { id: 90_000_120, name: 'Test Pilot Hauler' },
  pilotAltB: { id: 90_000_121, name: 'Test Pilot Prospector' },
  rook: { id: 90_000_130, name: 'Rook Belter' },
  lev: { id: 90_008_001, name: 'Lev Departed' },
  guest: { id: 90_009_001, name: 'Gale Outsider' },
} as const;

export type MinerKey = keyof typeof MINER;

const NAMES = new Map<number, string>([
  [OFFICER.id, OFFICER.name],
  ...Object.values(MINER).map((m) => [m.id, m.name] as const),
]);

export const nameOf = (id: number): string => NAMES.get(id) ?? `Pilot ${id}`;
export const corpOf = (id: number): number =>
  id === MINER.pilotAltB.id ? OTHER_CORP : id >= LEFT_FROM ? OUTSIDE_CORP : CORP;
export const recordedCorpOf = (id: number): number => (id >= OUTSIDE_FROM ? OUTSIDE_CORP : CORP);
export const solo = (id: number): string => `solo:${id}`;
