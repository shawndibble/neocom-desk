/**
 * Test-only ready dogma engine: every synchronous check a `vi.fn` with a
 * harmless default, so a hook or component test hands in the one answer it
 * is about instead of mocking the engine module.
 */
import { vi } from 'vitest';
import type { CandidateRack } from '@/engine/fittings/candidates';
import type { PilotProfile } from '@/engine/fittings/types';
import type { DogmaEngine } from '../dogmaFittingEngine';
import type { FittingContext } from '../fittingContext';
import type { FittingCatalogue } from '../useFittingCatalogue';

const ANY_CHECK = { fitsHull: true, canFly: true, fitsResources: true };

export function fakeDogmaEngine(overrides: Partial<DogmaEngine> = {}): DogmaEngine {
  return {
    checkCandidates: vi.fn(() => new Map()),
    checkOneCandidate: vi.fn(() => ANY_CHECK),
    checkHullCandidate: vi.fn(() => ANY_CHECK),
    moduleSkillRequirements: vi.fn(() => []),
    hullSlotCounts: vi.fn(() => ({ high: 0, medium: 0, low: 0, rig: 0, subsystem: 0 })),
    hullRacks: vi.fn(() => new Set<CandidateRack>()),
    checkCharges: vi.fn(() => new Set<number>()),
    chargeGroupIdsFor: vi.fn(() => []),
    moduleChargeCapacity: vi.fn(() => 0),
    chargesMissingSkills: vi.fn(() => new Set<number>()),
    compareCharges: vi.fn(() => []),
    ...overrides,
  };
}

const NO_SKILLS: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };

export function fakeFittingContext(
  catalogue: FittingCatalogue,
  {
    engine = fakeDogmaEngine(),
    profile = NO_SKILLS,
  }: { engine?: DogmaEngine; profile?: PilotProfile } = {}
): FittingContext {
  return { engine, profile, catalogue };
}
