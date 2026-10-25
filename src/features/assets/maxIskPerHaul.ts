/**
 * The Move plan's max ISK per haul: no single haul may be worth more. One
 * number, null for no limit. Device-local, like the active haul it shapes:
 * it is how much risk this pilot takes on a trip, not a setting other devices
 * need.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export function parseMaxIskPerHaul(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
}

export const useMaxIskPerHaul = createLocalSetting<number | null>({
  key: 'movePlanMaxIskPerHaul',
  defaultValue: null,
  parse: parseMaxIskPerHaul,
});
