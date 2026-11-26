import { describe, it, expect } from 'vitest';
import { normalizePlan } from '@/engine/skills/plan';
import { placeRemaps, suggestReorder } from '@/engine/optimizer';
import type { Attributes, EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { applyOptimizeForMe, type RemapPricingContext } from './skillPlanEdit';
import { applyReorderSuggestion } from './reorder';
import { markerStepIndices } from './markers';
import { optimizeAtMarkers } from '@/engine/optimizer';

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

  const A: EngineSkill = {
    typeID: 1,
    name: 'A',
    rank: 5,
    primary: 'perception',
    secondary: 'willpower',
    prereqs: [],
  };
  const B: EngineSkill = {
    typeID: 2,
    name: 'B',
    rank: 1,
    primary: 'intelligence',
    secondary: 'memory',
    prereqs: [{ typeID: 1, level: 2 }],
  };
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

    const previewedRemapCount = remaps.segments.filter((s) => s.remap).length;
    expect(newMarkers.length).toBeLessThanOrEqual(previewedRemapCount);

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
