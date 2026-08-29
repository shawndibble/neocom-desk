/**
 * "What-If Implants" (CONTEXT.md): a planner override that swaps the
 * clone's actual implant bonuses for a hypothetical set, for exploring "what
 * if I had +4s in" without touching the character's real fitted implants.
 */
import { ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { Implants } from '@/engine/types';

export type WhatIfImplantMode = 'none' | 'current' | '+1' | '+2' | '+3' | '+4' | '+5';

export const WHAT_IF_IMPLANT_MODES: readonly WhatIfImplantMode[] = [
  'none',
  'current',
  '+1',
  '+2',
  '+3',
  '+4',
  '+5',
];

/**
 * Resolve a mode to the Implants map fed into computeSchedule/the optimizer:
 * - 'none': no implant bonuses at all.
 * - 'current': the clone's real fitted implants, unchanged.
 * - '+1'..'+5': a hypothetical uniform set (that bonus in every attribute
 *   slot) — matches how a matched "hardwiring" implant set (e.g. all +5s)
 *   is commonly discussed, without modeling every specific implant SKU.
 */
export function whatIfImplants(mode: WhatIfImplantMode, currentImplants: Implants): Implants {
  if (mode === 'none') return {};
  if (mode === 'current') return currentImplants;
  const bonus = Number(mode.slice(1));
  const uniform: Implants = {};
  for (const name of ATTRIBUTE_NAMES) uniform[name] = bonus;
  return uniform;
}
