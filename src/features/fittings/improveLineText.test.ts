import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { ImproveOption } from '@/engine/fittings/improve';
import type { FittingStats } from '@/engine/fittings/types';
import { baseFittingStats } from '@/engine/fittings/__fixtures__/fittingStats';
import { NO_EXPLORE } from '@/engine/fittings/explore';
import { moveLine } from './improveLineText';

const t = i18n.t.bind(i18n);

const explore = (strength: number, coherence: number) =>
  ({
    ...baseFittingStats(),
    explore: {
      ...NO_EXPLORE,
      modules: 3,
      // A Data Analyzer: its strength is the data sites' figure.
      hacking: { strength, coherence, cycleSeconds: 10 },
      dataStrength: strength,
      scanning: { strength: 10, duration: 0, deviation: 0 },
    },
  }) as unknown as FittingStats;

describe('moveLine', () => {
  it('names only the figures the swap changes', () => {
    const option = { after: explore(130, 50) } as unknown as ImproveOption;
    expect(moveLine(t, 'explore', 'cargo', option, explore(110, 40))).toBe(
      'Data hacking strength 110 → 130 · Coherence 40 → 50'
    );
  });

  it('says nothing when no figure the goal scores moved', () => {
    const option = { after: explore(110, 40) } as unknown as ImproveOption;
    expect(moveLine(t, 'explore', 'cargo', option, explore(110, 40))).toBeNull();
  });
});
