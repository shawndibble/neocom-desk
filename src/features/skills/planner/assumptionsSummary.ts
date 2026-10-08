import type { WhatIfImplantSelection } from '@/db';

/** The planner's three standing assumptions, as the Assumptions row reads them. */
export interface AssumptionsState {
  /** The character is costed as an Alpha clone. */
  alpha: boolean;
  whatIf: WhatIfImplantSelection;
  /** The What-If Implants selection is one of the character's jump clones. */
  matchedJumpClone?: boolean;
  /** How many Boosters the plan carries. */
  boosterCount: number;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * One line saying what the plan is costed under: whichever of Alpha, an
 * implant what-if and a Booster is set, in the order the controls sit, or
 * "Defaults". Alpha, implants and Booster change every number on the page, so
 * the closed Assumptions row keeps them visible instead of hiding them.
 */
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
