import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { NO_EXPLORE } from '@/engine/fittings/explore';
import { baseFittingStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { FittingStats } from '@/engine/fittings/types';
import { ExploreFacts } from './FittingExploreStats';

const fact = (label: string) => screen.getByText(label).nextElementSibling?.textContent ?? '';

const withExplore = (explore: Partial<FittingStats['explore']>): FittingStats => ({
  ...baseFittingStats(),
  explore: { ...NO_EXPLORE, modules: 1, ...explore },
});

describe('ExploreFacts', () => {
  it('shows data and relic strength, the probe and the cloak relock', () => {
    render(
      <ExploreFacts
        stats={withExplore({
          hacking: { strength: 30, coherence: 30, cycleSeconds: 10 },
          dataStrength: 30,
          relicStrength: 30,
          utilitySlots: 1,
          probe: { strength: 103.98, launcherBonus: 10, cycleSeconds: 1.5 },
          cloakRecalibrationSeconds: 10,
        })}
      />
    );
    expect(fact('Data hacking strength')).toBe('30');
    expect(fact('Relic hacking strength')).toBe('30');
    expect(fact('Probe strength')).toBe('104.0');
    expect(fact('Launcher probe bonus')).toBe('10%');
    expect(fact('Cloak relock delay')).toBe('10.0 s');
  });

  it('says the launcher is empty, and leaves out what the fit has none of', () => {
    render(
      <ExploreFacts
        stats={withExplore({ probe: { strength: 0, launcherBonus: 10, cycleSeconds: 1.5 } })}
      />
    );
    expect(fact('Probe strength')).toBe('No probe loaded');
    expect(screen.queryByText('Relic hacking strength')).toBeNull();
    expect(screen.queryByText('Cloak relock delay')).toBeNull();
  });
});
