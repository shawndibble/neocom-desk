import { describe, it, expect } from 'vitest';
import { normalizePlan } from '@/engine/plan';
import { placeRemaps, suggestReorder } from '@/engine/optimizer';
import type { Attributes, EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { applyOptimizeForMe, type RemapPricingContext } from './skillPlanEdit';
import { applyReorderSuggestion } from './reorder';
import { markerStepIndices } from './markers';
import { optimizeAtMarkers } from '@/engine/optimizer';

/**
 * Regression for a real report: "Optimize for me" placed two Remap Markers
 * one skill apart, both with the exact same target attributes — a wasted
 * remap. Root cause: `suggestReorder` can separate a skill's implicit
 * prereqs (a different attribute pair) from the skill's own step, in an
 * order no entry list can represent — prereqs always expand next to their
 * dependent. `placeRemaps` then costed a segmentation that could never be
 * saved as-is. `handleOptimizeForMe` (PlanEditor.tsx) now re-prices against
 * the ACTUAL re-expansion of the reordered entries, and
 * `applyOptimizerRemapSegments` drops any marker a later entry-snap still
 * leaves redundant.
 */
describe('optimize-for-me remap consistency', () => {
  const CURRENT: Attributes = {
    intelligence: 20,
    memory: 20,
    perception: 20,
    willpower: 20,
    charisma: 19,
  };
  const NO_TRAINED = new Map<number, TrainedSkill>();
  const PRICING: RemapPricingContext = { currentAttributes: CURRENT };

  const attrEq = (a: Attributes, b: Attributes) =>
    (['intelligence', 'memory', 'perception', 'willpower', 'charisma'] as const).every(
      (k) => a[k] === b[k]
    );

  // A: perception/willpower, no prereq — the leading chunk.
  const A: EngineSkill = {
    typeID: 1,
    name: 'A',
    rank: 5,
    primary: 'perception',
    secondary: 'willpower',
    prereqs: [],
  };
  // B: intelligence/memory, needs A at II — its own step sits behind a
  // perception/willpower prereq chain `suggestReorder` can pull apart.
  const B: EngineSkill = {
    typeID: 2,
    name: 'B',
    rank: 1,
    primary: 'intelligence',
    secondary: 'memory',
    prereqs: [{ typeID: 1, level: 2 }],
  };
  // C: perception/willpower, no prereq — the trailing chunk.
  const C: EngineSkill = {
    typeID: 3,
    name: 'C',
    rank: 5,
    primary: 'perception',
    secondary: 'willpower',
    prereqs: [],
  };
  const SKILLS = new Map<number, EngineSkill>([
    [1, A],
    [2, B],
    [3, C],
  ]);
  const ENTRIES: PlanEntry[] = [
    { skillTypeID: 2, targetLevel: 1 },
    { skillTypeID: 3, targetLevel: 5 },
  ];

  it('never applies a plan whose remap markers disagree with the previewed segments', () => {
    const steps = normalizePlan(ENTRIES, SKILLS, NO_TRAINED);

    // What the previewed order actually re-expands to, once entries are
    // reconstructed from it — the fix: re-price against THIS, not the raw
    // suggestReorder output.
    const suggested = suggestReorder(steps, SKILLS, undefined);
    const reorderedEntries = applyReorderSuggestion(ENTRIES, suggested);
    const order = normalizePlan(reorderedEntries, SKILLS, NO_TRAINED);
    const remaps = placeRemaps(order, SKILLS, { remapCount: 2, currentAttributes: CURRENT });

    const patch = applyOptimizeForMe(
      { entries: ENTRIES, markers: [], markerAttributes: [] },
      order,
      remaps.segments,
      SKILLS,
      NO_TRAINED,
      PRICING
    );
    const newEntries = patch.entries!;
    const newMarkers = patch.markers!;

    // The preview's segment count must match what actually got applied.
    const previewedRemapCount = remaps.segments.filter((s) => s.remap).length;
    expect(newMarkers.length).toBeLessThanOrEqual(previewedRemapCount);

    // And whatever DID get applied must never leave two adjacent remaps with
    // the exact same target attributes.
    const newSteps = normalizePlan(newEntries, SKILLS, NO_TRAINED);
    const stepIndices = markerStepIndices(newEntries, newMarkers, SKILLS, NO_TRAINED);
    const resolved = optimizeAtMarkers(newSteps, SKILLS, {
      markers: stepIndices,
      currentAttributes: CURRENT,
    });
    const remapSegments = resolved.segments.filter((s) => s.remap);
    for (let i = 1; i < remapSegments.length; i++) {
      expect(attrEq(remapSegments[i - 1].attributes, remapSegments[i].attributes)).toBe(false);
    }
  });
});
