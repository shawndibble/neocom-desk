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
