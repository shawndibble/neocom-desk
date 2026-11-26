import { getDecimalMark, getGroupMark } from '@/lib/numberLocale';

export const OFFLINE_PACK_IDS = [
  'itemInfo',
  'market',
  'planetary',
  'reference',
  'appPages',
] as const;
export type OfflinePackId = (typeof OFFLINE_PACK_IDS)[number];

export function packFor(file: string): OfflinePackId {
  if (file.startsWith('typeInfo/')) return 'itemInfo';
  if (file.startsWith('market/') || file === 'marketWideTrees.json') return 'market';
  if (file.startsWith('pi-')) return 'planetary';
  if (file.startsWith('assets/')) return 'appPages';
  return 'reference';
}

export type PackState = 'complete' | 'partial' | 'missing';

export interface PackSummary {
  id: OfflinePackId;
  total: number;
  cached: number;
  state: PackState;
}

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

export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // eslint-disable-next-line no-restricted-syntax -- English unit names; the marks are swapped below.
  const text = new Intl.NumberFormat('en', {
    style: 'unit',
    unit: UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
  return text.replace(/[.,]/g, (c) => (c === '.' ? getDecimalMark() : getGroupMark()));
}
