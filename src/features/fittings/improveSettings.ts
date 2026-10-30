import type { DefenseChoice, ImproveHold, ImproveReach } from '@/engine/fittings/improve';
import type { ExploreSpace, ImproveJob } from '@/engine/fittings/improveJob';
import type { ImproveSort } from '@/engine/fittings/improveRows';

/** What the drawer asks of a search beyond the goal; the hook that owns the state passes it whole. */
export interface ImproveSettings {
  /** Absent: no Job control is drawn. */
  job?: ImproveJob;
  onJobChange?: (job: ImproveJob) => void;
  /** Explore only; Dangerous when absent. */
  space?: ExploreSpace;
  onSpaceChange?: (space: ExploreSpace) => void;
  /** PvE only: the Makeover adds no propulsion module. */
  noPropulsion?: boolean;
  onNoPropulsionChange?: (on: boolean) => void;
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
