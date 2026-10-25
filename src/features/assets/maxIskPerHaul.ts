/**
 * The Move plan's max ISK per haul: no single haul may be worth more. One
 * number, null for no limit. Device-local, like the active haul it shapes:
 * it is how much risk this pilot takes on a trip, not a setting other devices
 * need.
 */
import { normalizeMaxIsk } from '@/engine/assets/haulPacking';
import { createLocalSetting } from '@/lib/useLocalSetting';

export function parseMaxIskPerHaul(raw: unknown): number | null {
  return normalizeMaxIsk(raw);
}

export const useMaxIskPerHaul = createLocalSetting<number | null>({
  key: 'movePlanMaxIskPerHaul',
  defaultValue: null,
  parse: parseMaxIskPerHaul,
});
