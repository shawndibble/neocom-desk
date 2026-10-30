import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { HOUR_MS } from '@/lib/age';

/** Sample moon owner rows for stories; all names invented. */
export const NAMES: Record<number, string> = {
  1: 'Ashfall Mining Collective',
  2: 'Cinder Reach Holdings',
  3: 'Vantor Freight',
  4: 'Ostrava Salvage',
  5: 'Halcyon Drift',
  6: 'Brinewater Guild',
};
export const NOW = Date.UTC(2026, 9, 20, 12);
const synced = new Date(NOW - 2 * HOUR_MS).toISOString();

const row = (over: Partial<MoonOwnerRow> & Pick<MoonOwnerRow, 'corporationId'>): MoonOwnerRow => ({
  id: String(over.corporationId),
  status: 'active',
  refineryCount: 2,
  mined: 0,
  owed: 0,
  balance: { kind: 'none', isk: 0 },
  mode: 'normal',
  lastReadWellAt: synced,
  ...over,
});

export const ROWS: MoonOwnerRow[] = [
  row({
    corporationId: 1,
    mined: 412_806_000,
    since: '2026-10-01',
    theirRatePct: 8,
    minerRatePct: 12,
    owed: 13_024_480,
  }),
  row({
    corporationId: 2,
    status: 'cant-read',
    mined: 96_540_000,
    until: '2026-10-11',
    staleSince: Date.UTC(2026, 9, 11, 9, 12),
    theirRatePct: 7,
    minerRatePct: 11,
    owed: 6_182_000,
  }),
  row({
    corporationId: 3,
    mined: 168_211_000,
    since: '2026-10-01',
    theirRatePct: 5,
    minerRatePct: 8,
    owed: 3_410_550,
  }),
  row({
    corporationId: 4,
    status: 'removal-pending',
    mined: 15_083_000,
    since: '2026-10-01',
    theirRatePct: 6,
    minerRatePct: 10,
    owed: 905_000,
  }),
  row({
    corporationId: 5,
    status: 'settled-otherwise',
    mode: 'settled-otherwise',
    mined: 74_300_000,
    since: '2026-10-01',
    minerRatePct: 9,
  }),
  row({
    corporationId: 6,
    status: 'no-rate',
    mined: 31_950_000,
    since: '2026-10-14',
    minerRatePct: 10,
  }),
];

export const TOTALS = { owed: 23_522_030, paidThisMonth: 25_575_800, count: 6, needALook: 2 };
