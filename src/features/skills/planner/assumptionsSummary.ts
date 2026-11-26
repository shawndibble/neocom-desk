import type { WhatIfImplantSelection } from '@/db';
import type { Translate } from '@/lib/translate';

export interface AssumptionsState {
  alpha: boolean;
  whatIf: WhatIfImplantSelection;
  matchedJumpClone?: boolean;
  boosterCount: number;
}

export function assumptionsSummary(state: AssumptionsState, t: Translate): string {
  const parts: string[] = [];
  if (state.alpha) parts.push(t('plans.assumptions.alpha'));

  if (state.matchedJumpClone) {
    parts.push(t('plans.assumptions.jumpCloneImplants'));
  } else if (state.whatIf.kind === 'custom') {
    parts.push(t('plans.assumptions.customImplants'));
  } else if (state.whatIf.preset === 'none') {
    parts.push(t('plans.assumptions.noImplants'));
  } else if (state.whatIf.preset !== 'current') {
    parts.push(t('plans.assumptions.implantsPreset', { preset: state.whatIf.preset }));
  }

  if (state.boosterCount > 0) parts.push(t('plans.assumptions.booster'));

  return parts.length > 0 ? parts.join(' · ') : t('plans.assumptions.defaults');
}
