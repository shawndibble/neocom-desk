import type { DefenseChoice, ImproveHold, ImproveReach } from '@/engine/fittings/improve';
import type { DefenseSide } from '@/engine/fittings/improveGroups';
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
  /** The tank side the fit already has (`fittedSide`); null for none or an even split. */
  fittedSide?: DefenseSide | null;
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

/** The two sides the Defense control offers; the fit's own one is Keep as is. */
export const DEFENSE_SIDES: readonly DefenseSide[] = ['shield', 'armor'];

/** The Defense control's options: Shield and Armor, the fit's own one meaning Keep as is; a fit with no side also gets Either (keep). */
export const defenseOptions = (fitted: DefenseSide | null): readonly DefenseChoice[] =>
  fitted ? DEFENSE_SIDES : [...DEFENSE_SIDES, 'keep'];

/** The side the Defense control shows: a chosen side as itself, else the fit's own (Keep as is); 'keep' (nothing selected) when the fit has none. */
export const shownDefense = (defense: DefenseChoice, fitted: DefenseSide | null): DefenseChoice =>
  defense === 'keep' ? (fitted ?? 'keep') : defense;

/** A pick on the Defense control: the fit's own side keeps its tank, the other side converts. */
export const pickedDefense = (picked: DefenseSide, fitted: DefenseSide | null): DefenseChoice =>
  picked === fitted ? 'keep' : picked;
