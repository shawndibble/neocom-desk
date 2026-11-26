/** D13: SRP settings, Doctrine Fits, killmails and claims for Halcyon Forge Industries. */
import { CORP_ID, MEMBERS, memberByName } from './D13-hfind';

const T = { drake: 24698, hulk: 22544, rifter: 587 };
export const SRP_SETTINGS = {
  killmailPct: 60,
  appraisalPct: null,
  hullRules: [
    { scope: 'hull', id: T.rifter, kind: 'pay-fixed', iskAmount: 4_000_000 },
    { scope: 'hull', id: T.drake, kind: 'pay-percent' },
    { scope: 'hull', id: T.hulk, kind: 'pay-percent' },
    { scope: 'hull', id: 28606, kind: 'officer-decides' },
    { scope: 'hull', id: 16240, kind: 'not-covered' },
  ],
  windowDays: 30,
  requireFleetOrFc: false,
};

const DRAKE_MODULES = [2410, 2410, 2410, 2410, 2410, 2410, 3841, 3841, 2281, 2032, 448, 22291, 22291, 22291, 2048];
const DRAKE_RIGS = [31796, 31796, 31802];
const HULK_MODULES = [17912, 17912, 17912, 28576, 28576, 28576];
export const DOCTRINES = [
  { id: 'drake-hml', name: 'Drake - Shield HML', snapshot: { hullTypeId: T.drake, name: 'Drake - Shield HML', modules: DRAKE_MODULES, rigs: DRAKE_RIGS } },
  { id: 'hulk-strip', name: 'Hulk - Strip Miner', snapshot: { hullTypeId: T.hulk, name: 'Hulk - Strip Miner', modules: HULK_MODULES, rigs: [] } },
];

const OFF_DRAKE_MODULES = DRAKE_MODULES.map((m) => (m === 448 ? 12058 : m));
type Fit = { modules: number[]; rigs: number[] };
const flagsOf = (fit: Fit, hull: number) => {
  // Racks by hull: highs first, then mids, lows (types listed in doctrine order: highs, mids, lows).
  const items: { item_type_id: number; flag: number; quantity_destroyed: number; singleton: number }[] = [];
  const split = hull === T.drake ? [6, 5, 4] : [3, 0, 3];
  let i = 0;
  const bases = [27, 19, 11];
  split.forEach((count, rack) => {
    for (let n = 0; n < count; n++)
      items.push({ item_type_id: fit.modules[i++], flag: bases[rack] + n, quantity_destroyed: 1, singleton: 0 });
  });
  fit.rigs.forEach((id, n) => items.push({ item_type_id: id, flag: 92 + n, quantity_destroyed: 1, singleton: 0 }));
  items.push({ item_type_id: 2488 + 0, flag: 5, quantity_destroyed: 0, singleton: 0 } as never);
  items.pop();
  return items;
};

const NOUR = 30001376, TUNT = 30001379, SARE = 30001377;
export interface Km { id: number; hash: string; hull: number; system: number; pilotId: number; items: ReturnType<typeof flagsOf>; ageHours: number }
const hash = (n: number) => (n.toString(16).padStart(8, '0') + 'c3a91f0d7be24a68915fd0a2e7b3c4d1').slice(0, 40);
const km = (id: number, hull: number, system: number, pilot: string, fit: Fit, ageHours: number): Km => ({
  id, hash: hash(id), hull, system, pilotId: memberByName(pilot).id, items: flagsOf(fit, hull), ageHours,
});
const GOOD_DRAKE: Fit = { modules: DRAKE_MODULES, rigs: DRAKE_RIGS };
const OFF_DRAKE: Fit = { modules: OFF_DRAKE_MODULES, rigs: DRAKE_RIGS };
const HULK: Fit = { modules: HULK_MODULES, rigs: [] };
const BARE: Fit = { modules: [], rigs: [] };

export const KILLMAILS: Km[] = [
  km(131_000_001, T.drake, TUNT, 'Kaelen Voss', GOOD_DRAKE, 9),
  km(131_000_002, T.drake, NOUR, 'Thessaly Crane', OFF_DRAKE, 14),
  km(131_000_003, T.hulk, SARE, 'Oriel Tanvar', HULK, 20),
  km(131_000_004, T.rifter, NOUR, 'Wystan Pryce', BARE, 26),
  km(131_000_005, T.drake, TUNT, 'Odalys Venn', GOOD_DRAKE, 31),
  km(131_000_006, T.drake, NOUR, 'Sennet Hale', GOOD_DRAKE, 52),
  km(131_000_007, T.hulk, SARE, 'Rhosyn Marek', HULK, 60),
  km(131_000_008, T.rifter, TUNT, 'Ravenna Skye', BARE, 64),
  km(131_000_009, T.drake, NOUR, 'Lucan Dray', GOOD_DRAKE, 150),
  km(131_000_010, T.rifter, SARE, 'Zephyr Ashgrove', BARE, 170),
  km(131_000_011, T.drake, TUNT, 'Ulric Maddox', OFF_DRAKE, 190),
  // Mira's loss, not yet claimed: the member's filing demo.
  { ...km(131_000_101, T.drake, TUNT, 'Mira Voskane', GOOD_DRAKE, 5), pilotId: 90_000_011 },
];

type Check = { status: 'matched' | 'off-doctrine' | 'not-checked'; doctrineId?: string; doctrineName?: string; diff?: { missingModules: number[]; extraModules: number[]; missingRigs: number[]; extraRigs: number[] } };
export const MATCH_DRAKE: Check = { status: 'matched', doctrineId: 'drake-hml', doctrineName: 'Drake - Shield HML' };
export const OFF_DRAKE_CHECK: Check = {
  status: 'off-doctrine', doctrineId: 'drake-hml', doctrineName: 'Drake - Shield HML',
  diff: { missingModules: [448], extraModules: [12058], missingRigs: [], extraRigs: [] },
};
const MATCH_HULK: Check = { status: 'matched', doctrineId: 'hulk-strip', doctrineName: 'Hulk - Strip Miner' };

interface ClaimSeed {
  killmailId: number; pilot: { id: number; name: string }; state: 'pending' | 'approved' | 'paid' | 'rejected';
  amount: number; basis: unknown; filedAt: number; check?: Check; fc?: string; note?: string; reason?: string;
}
const PCT = { step: 'killmail-percent', percent: 60 };
const FIXED = { step: 'hull-fixed' };
export function claimsSeed(now: number): ClaimSeed[] {
  const H = 3_600_000;
  const p = (name: string) => ({ id: memberByName(name).id, name });
  const c = (id: number, name: string, state: ClaimSeed['state'], amount: number, basis: unknown, ageH: number, check?: Check, extra: Partial<ClaimSeed> = {}): ClaimSeed =>
    ({ killmailId: id, pilot: p(name), state, amount, basis, filedAt: now - ageH * H, check, ...extra });
  return [
    c(131_000_001, 'Kaelen Voss', 'pending', 26_400_000, PCT, 7, MATCH_DRAKE, { fc: 'Petra Lindqvist' }),
    c(131_000_002, 'Thessaly Crane', 'pending', 24_900_000, PCT, 11, OFF_DRAKE_CHECK, { note: 'Fit changed after the last doctrine update' }),
    c(131_000_003, 'Oriel Tanvar', 'pending', 142_800_000, PCT, 18, MATCH_HULK, { fc: 'Joren Fell' }),
    c(131_000_004, 'Wystan Pryce', 'pending', 4_000_000, FIXED, 24),
    c(131_000_005, 'Odalys Venn', 'pending', 25_700_000, PCT, 29, MATCH_DRAKE),
    c(131_000_006, 'Sennet Hale', 'approved', 24_200_000, PCT, 50, MATCH_DRAKE),
    c(131_000_007, 'Rhosyn Marek', 'approved', 139_500_000, PCT, 58, MATCH_HULK),
    c(131_000_008, 'Ravenna Skye', 'approved', 4_000_000, FIXED, 62),
    c(131_000_009, 'Lucan Dray', 'paid', 25_100_000, PCT, 148, MATCH_DRAKE),
    c(131_000_010, 'Zephyr Ashgrove', 'paid', 4_000_000, FIXED, 168),
    c(131_000_011, 'Ulric Maddox', 'rejected', 24_000_000, PCT, 188, OFF_DRAKE_CHECK, { reason: 'Not a doctrine fit' }),
  ];
}
void MEMBERS; void CORP_ID;
