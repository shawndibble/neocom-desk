import { isPlainRecord } from '@/engine/guards';

export const DIVISION_NAME_MAX = 50;

export type DivisionNames = Record<number, string>;

export function readDivisionNames(value: unknown): DivisionNames {
  if (!isPlainRecord(value)) return {};
  const names: DivisionNames = {};
  for (const [key, name] of Object.entries(value)) {
    if (!/^[1-7]$/.test(key) || typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (trimmed) names[Number(key)] = trimmed;
  }
  return names;
}

export function divisionNamesToPush(
  divisions: readonly number[],
  stored: Readonly<DivisionNames> | undefined,
  read: readonly { division?: number; name?: string }[]
): DivisionNames | null {
  const next: DivisionNames = {};
  for (const entry of read) {
    const name = entry.name?.trim();
    if (
      entry.division !== undefined &&
      divisions.includes(entry.division) &&
      name &&
      name.length <= DIVISION_NAME_MAX
    ) {
      next[entry.division] = name;
    }
  }
  const keys = Object.keys(next);
  const same =
    keys.length === Object.keys(stored ?? {}).length &&
    keys.every((k) => stored?.[Number(k)] === next[Number(k)]);
  return same ? null : next;
}
