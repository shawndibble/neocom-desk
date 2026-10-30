import { describe, expect, it } from 'vitest';
import { extractExplore, NO_EXPLORE } from './explore';

const item = (typeId = 1, slot = 'high') => ({ type_id: typeId, slot: { type: slot } });
const attributes = (attrs: Record<number, number>) =>
  new Map(Object.entries(attrs).map(([id, value]) => [Number(id), { value }]));
const result = (
  attrs: Record<number, number>,
  state = 'active',
  charge?: Record<number, number>
) => ({
  state,
  attributes: attributes(attrs),
  ...(charge ? { charge: { attributes: attributes(charge) } } : {}),
});

const HACKING = 21718;
const ARCHAEOLOGY = 13278;

describe('extractExplore', () => {
  it('is empty for a fit with no explorer module', () => {
    expect(extractExplore([item()], [result({ 73: 5000 })])).toEqual(NO_EXPLORE);
  });

  // SDE names: 1910 is Virus Strength, 1909 is Virus Coherence (a Data Analyzer II: 30 and 60).
  it('reads the best analyzer: strength, coherence, fastest cycle', () => {
    const explore = extractExplore(
      [item(1), item(2)],
      [result({ 1910: 60, 1909: 40, 73: 10_000 }), result({ 1910: 70, 1909: 30, 73: 8_000 })]
    );
    expect(explore.modules).toBe(2);
    expect(explore.hacking).toEqual({ strength: 70, coherence: 40, cycleSeconds: 8 });
    expect(explore.analyzers).toEqual([
      { strength: 60, coherence: 40, cycleSeconds: 10, sites: [] },
      { strength: 70, coherence: 30, cycleSeconds: 8, sites: [] },
    ]);
  });

  it('sums scan array bonuses, duration and deviation as cuts', () => {
    const explore = extractExplore(
      [item(1), item(2), item(3)],
      [result({ 1906: -20 }), result({ 1905: -20 }), result({ 1907: 10 })]
    );
    expect(explore.modules).toBe(3);
    expect(explore.scanning).toEqual({ strength: 10, duration: 20, deviation: 20 });
  });

  it('counts a probe launcher (takes scan probes) as an explorer module with no figure', () => {
    const explore = extractExplore([item()], [result({ 604: 479 })]);
    expect(explore.modules).toBe(1);
    expect(explore.analyzers).toEqual([]);
  });

  it('reads strength off Virus Strength, not Virus Coherence', () => {
    // A Data Analyzer II on a hull with no hacking bonus.
    const explore = extractExplore([item()], [result({ 1910: 30, 1909: 60, 73: 10_000 })]);
    expect(explore.hacking).toEqual({ strength: 30, coherence: 60, cycleSeconds: 10 });
  });

  it('does not count a Mining Survey Chipset (its crit bonus is not a survey range)', () => {
    expect(extractExplore([item()], [result({ 6050: 0.05 })])).toEqual(NO_EXPLORE);
  });

  it('ignores drones and offline modules', () => {
    expect(extractExplore([item(1, 'drone_bay')], [result({ 1910: 60 })]).modules).toBe(0);
    expect(extractExplore([item()], [result({ 1910: 60 }, 'offline')]).modules).toBe(0);
  });

  it('splits hacking strength by the site an analyzer opens, off its required skills', () => {
    const explore = extractExplore(
      [item(1), item(2)],
      [
        result({ 1910: 40, 1909: 80, 182: HACKING }),
        // An Integrated Analyzer needs both skills, and opens both sites.
        result({ 1910: 30, 1909: 30, 182: ARCHAEOLOGY, 183: HACKING }),
      ]
    );
    expect(explore.dataStrength).toBe(40);
    expect(explore.relicStrength).toBe(30);
    expect(explore.analyzers.map((analyzer) => analyzer.sites)).toEqual([
      ['data'],
      ['data', 'relic'],
    ]);
  });

  it('reads the analyzer utility slots', () => {
    const explore = extractExplore([item()], [result({ 1910: 30, 182: HACKING, 1911: 3 })]);
    expect(explore.utilitySlots).toBe(3);
  });

  it("reads the loaded probe's strength, the launcher's bonus and its cycle", () => {
    const explore = extractExplore(
      [item()],
      // A Sisters launcher with Sisters probes, as the engine leaves them on an Astero.
      [result({ 604: 479, 846: 10, 51: 1500 }, 'active', { 1371: 103.98 })]
    );
    expect(explore.probe).toEqual({ strength: 103.98, launcherBonus: 10, cycleSeconds: 1.5 });
  });

  it('keeps the launcher bonus when no probe is loaded', () => {
    const explore = extractExplore([item()], [result({ 604: 479, 846: 10, 51: 1500 })]);
    expect(explore.probe).toEqual({ strength: 0, launcherBonus: 10, cycleSeconds: 1.5 });
  });

  it("reads a cloak's relock delay without making it an explorer module", () => {
    const explore = extractExplore([item()], [result({ 560: 10_000 }, 'online')]);
    expect(explore.cloakRecalibrationSeconds).toBe(10);
    expect(explore.modules).toBe(0);
  });
});
