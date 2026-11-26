import { formatIsk } from '@/lib/isk';
import { formatNumber } from '@/lib/numberLocale';
import type { OreShare } from './moonsAllMoonsFixtures';

export const isk = (n: number) => formatIsk(n);

export const units = (n: number) => formatNumber(n);

export function makeUp(ore: OreShare[]): string {
  const total = ore.reduce((s, o) => s + o.units, 0);
  return ore.map((o) => `${o.ore} ${Math.round((o.units / total) * 100)}%`).join(' · ');
}
