import type { DefenseChoice } from '@/engine/fittings/improve';
import type { DefenseSide } from '@/engine/fittings/improveGroups';
import type { ImproveSort } from '@/engine/fittings/improveRows';
import type { ImproveConfig } from './improveSearch/types';

/**
 * What the drawer's controls show: the search's settings and the row order.
 * Absent Job: no Job control is drawn (Explore space defaults to Dangerous).
 */
export type ImproveChoices = Omit<ImproveConfig, 'job' | 'space' | 'noPropulsion'> &
  Partial<Pick<ImproveConfig, 'job' | 'space' | 'noPropulsion'>> & { sort: ImproveSort };

/** Not remembered: a Defense Choice, the Officer tick and mutated swaps are about the open fit. */
const PER_FIT_FIELDS = ['defense', 'includeOfficer', 'allowMutated'] as const;
export type PerFitField = (typeof PER_FIT_FIELDS)[number];
export const isPerFit = (field: string): field is PerFitField =>
  (PER_FIT_FIELDS as readonly string[]).includes(field);

/** The drawer's settings, handed whole to the panel: what they are, and how a control changes them. */
export interface ImproveSettings {
  value: ImproveChoices;
  /** One control's change; the hook that owns the state remembers what is remembered. */
  onChange: (patch: Partial<ImproveChoices>) => void;
  /** The tank side the fit already has (`fittedSide`); null for none or an even split. */
  fittedSide?: DefenseSide | null;
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
