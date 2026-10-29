import type { DefenseChoice, ImproveHold, ImproveReach } from '@/engine/fittings/improve';
import type { ImproveSort } from '@/engine/fittings/improveRows';

/** What the drawer asks of a search beyond the goal; the hook that owns the state passes it whole. */
export interface ImproveSettings {
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
