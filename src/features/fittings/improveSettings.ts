import type { DefenseChoice } from '@/engine/fittings/improve';
import type { DefenseSide } from '@/engine/fittings/improve';
import type { ImproveSort } from '@/engine/fittings/improve';
import type { ImproveConfig } from './improveSearch/types';

export type ImproveChoices = Omit<ImproveConfig, 'job' | 'space' | 'noPropulsion'> &
  Partial<Pick<ImproveConfig, 'job' | 'space' | 'noPropulsion'>> & { sort: ImproveSort };

const PER_FIT_FIELDS = ['defense', 'includeOfficer', 'allowMutated'] as const;
export type PerFitField = (typeof PER_FIT_FIELDS)[number];
export const isPerFit = (field: string): field is PerFitField =>
  (PER_FIT_FIELDS as readonly string[]).includes(field);

export interface ImproveSettings {
  value: ImproveChoices;
  onChange: (patch: Partial<ImproveChoices>) => void;
  fittedSide?: DefenseSide | null;
}

export const DEFENSE_SIDES: readonly DefenseSide[] = ['shield', 'armor'];

export const defenseOptions = (fitted: DefenseSide | null): readonly DefenseChoice[] =>
  fitted ? DEFENSE_SIDES : [...DEFENSE_SIDES, 'keep'];

export const shownDefense = (defense: DefenseChoice, fitted: DefenseSide | null): DefenseChoice =>
  defense === 'keep' ? (fitted ?? 'keep') : defense;

export const pickedDefense = (picked: DefenseSide, fitted: DefenseSide | null): DefenseChoice =>
  picked === fitted ? 'keep' : picked;
