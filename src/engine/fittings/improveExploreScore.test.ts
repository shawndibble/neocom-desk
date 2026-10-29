import { describe, expect, it } from 'vitest';
import { scoreOf } from './improve';
import { NO_EXPLORE, type AnalyzerStats } from './explore';
import type { FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

const analyzer = (strength: number): AnalyzerStats => ({
  strength,
  coherence: 40,
  cycleSeconds: 10,
});

function fit(analyzers: AnalyzerStats[], maxVelocity = 1000): FittingStats {
  const base = baseFittingStats();
  return {
    ...base,
    navigation: { ...base.navigation, maxVelocity },
    explore: { ...NO_EXPLORE, modules: analyzers.length, hacking: analyzers[0]!, analyzers },
  };
}

const score = (before: FittingStats, after: FittingStats) =>
  scoreOf('explore', before, after, null, undefined, 'cargo')!;

describe('Explore better scores hacking by analyzer', () => {
  const data = analyzer(100);
  const relic = analyzer(100);
  const before = fit([data, relic]);

  it('a Data rig plus a Relic rig gains more than either alone', () => {
    const dataRig = fit([analyzer(130), relic]);
    const relicRig = fit([data, analyzer(130)]);
    const both = fit([analyzer(130), analyzer(130)]);
    expect(score(before, both)).toBeGreaterThan(score(before, dataRig));
    expect(score(before, both)).toBeGreaterThan(score(before, relicRig));
  });

  it('a strength rig outscores a speed module that gains the same relative amount', () => {
    expect(score(before, fit([analyzer(120), relic]))).toBeGreaterThan(
      score(before, fit([data, relic], 1200))
    );
  });

  it('a lost analyzer still counts -1', () => {
    // Each of its three figures counts -1; hacking and mobility are the two families.
    expect(score(before, fit([data]))).toBeCloseTo(-1.5);
    expect(score(before, fit([data, relic]))).toBe(0);
  });
});
