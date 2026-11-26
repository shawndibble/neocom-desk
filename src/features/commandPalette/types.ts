import type { ReactNode } from 'react';
import type { CharacterScopeReadoutProps } from '@/features/character/CharacterScopeReadout';

export type PaletteAltOutcome = { tone: 'status' | 'alert'; text: ReactNode } | null;

export interface PaletteAltAction {
  readonly label: string;
  run(): PaletteAltOutcome | PromiseLike<PaletteAltOutcome>;
}

export interface PaletteResult {
  readonly id: string;
  readonly label: string;
  readonly sublabel?: string;
  readonly hint?: string;
  readonly locked?: boolean;
  run(): void;
  readonly altAction?: PaletteAltAction;
}

export interface PaletteProvider {
  readonly id: string;
  readonly labelKey: string;
  readonly order: number;
  readonly errorKey?: string;
  readonly scope?: CharacterScopeReadoutProps;
  readonly minQueryLength?: number;
  search(
    query: string,
    signal: AbortSignal
  ): readonly PaletteResult[] | PromiseLike<readonly PaletteResult[]>;
}

export const GROUP_LIMIT = 6;
