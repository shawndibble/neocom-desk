import type { DefenseChoice, ImproveHold, ImproveReach } from '@/engine/fittings/improve';
import type { ImproveSort } from '@/engine/fittings/improveRows';

/** The Improve Job (#5564 owns the engine type; the wiring ticket swaps this for it). */
export type ImproveJob = 'pve' | 'pvp' | 'explore';
/** Where an Explore fit flies. */
export type ImproveSpace = 'dangerous' | 'safe';
export const IMPROVE_JOBS: readonly ImproveJob[] = ['pve', 'pvp', 'explore'];
export const IMPROVE_SPACES: readonly ImproveSpace[] = ['dangerous', 'safe'];

/** What the drawer asks of a search beyond the goal; the hook that owns the state passes it whole. */
export interface ImproveSettings {
  /** Absent until the wiring ticket connects it: no Job control is drawn. */
  job?: ImproveJob;
  onJobChange?: (job: ImproveJob) => void;
  /** Explore only; Dangerous when absent. */
  space?: ImproveSpace;
  onSpaceChange?: (space: ImproveSpace) => void;
  reach: ImproveReach;
  onReachChange: (reach: ImproveReach) => void;
  /** How each section's rows are ordered. */
  sort: ImproveSort;
  onSortChange: (sort: ImproveSort) => void;
  /** Total budget in ISK; null is no limit. */
  iskBudget: number | null;
  onIskBudgetChange: (cap: number | null) => void;
  defense: DefenseChoice;
  onDefenseChange: (defense: DefenseChoice) => void;
  includeRigs: boolean;
  onIncludeRigsChange: (on: boolean) => void;
  includeOfficer: boolean;
  onIncludeOfficerChange: (on: boolean) => void;
  /** Mine more: the crystal family (ore) the miners are scored with. */
  oreFamily: string;
  onOreFamilyChange: (family: string) => void;
  /** Carry more: the hold scored. */
  hold: ImproveHold;
  onHoldChange: (hold: ImproveHold) => void;
}
