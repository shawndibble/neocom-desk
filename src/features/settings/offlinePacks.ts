/**
 * Settings → Offline data: how the downloadable files group into the packs a
 * pilot recognises, and how a byte count reads. Pure: the Cache Storage reads
 * live in `offlineStatus.ts`.
 */
import { getDecimalMark } from '@/lib/numberLocale';

/** The lazy SDE packs, in display order (the fitting engine is a pack of its own, outside this list). */
export const OFFLINE_PACK_IDS = ['itemInfo', 'market', 'planetary', 'reference'] as const;
export type OfflinePackId = (typeof OFFLINE_PACK_IDS)[number];

/**
 * Which pack a `public/data` file belongs to. Anything unrecognised is
 * `reference`, so a file added to `LAZY_SDE_FILES` shows up (and is counted)
 * without touching this.
 */
export function packFor(file: string): OfflinePackId {
  if (file.startsWith('typeInfo/')) return 'itemInfo';
  if (file.startsWith('market/') || file === 'marketWideTrees.json') return 'market';
  if (file.startsWith('pi-')) return 'planetary';
  return 'reference';
}

export type PackState = 'complete' | 'partial' | 'missing';

export interface PackSummary {
  id: OfflinePackId;
  total: number;
  cached: number;
  state: PackState;
}

/** One summary per non-empty pack: `cached` counts the files of the pack present in `cachedFiles`. */
export function summarizePacks(
  files: readonly string[],
  cachedFiles: ReadonlySet<string>
): PackSummary[] {
  const counts = new Map<OfflinePackId, { total: number; cached: number }>();
  for (const file of files) {
    const id = packFor(file);
    const entry = counts.get(id) ?? { total: 0, cached: 0 };
    entry.total += 1;
    if (cachedFiles.has(file)) entry.cached += 1;
    counts.set(id, entry);
  }
  return OFFLINE_PACK_IDS.flatMap((id) => {
    const entry = counts.get(id);
    if (!entry) return [];
    const state: PackState =
      entry.cached === entry.total ? 'complete' : entry.cached === 0 ? 'missing' : 'partial';
    return [{ id, ...entry, state }];
  });
}

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/** "5 MB", "3.5 GB": binary steps, at most one decimal, with the Number format's decimal mark. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = new Intl.NumberFormat('en', {
    style: 'unit',
    unit: UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
  // Unit names stay English; only the decimal mark follows the Number format.
  return getDecimalMark() === ',' ? text.replace('.', ',') : text;
}
