/**
 * "What-If Implants" (CONTEXT.md): a planner override that swaps the
 * clone's actual implant bonuses for a hypothetical set, for exploring "what
 * if I had +4s in" without touching the character's real fitted implants.
 *
 * EVE's attribute hardwirings are **per slot** — a clone can perfectly well
 * run +4 PER / +5 INT / +3 MEM and nothing in WIL or CHA — so the set is five
 * independent bonuses, not one number. The uniform tiers stay as one-click
 * presets because a matched set is the common case; a per-attribute edit is
 * what the presets could not express.
 */
import type { AttributeName, Attributes, Implants } from '@/engine/types';

/** The one-click sets. `+N` is that bonus in every slot. */
export type WhatIfImplantPreset = 'none' | 'current' | '+1' | '+2' | '+3' | '+4' | '+5';

export const WHAT_IF_IMPLANT_PRESETS: readonly WhatIfImplantPreset[] = [
  'none',
  'current',
  '+1',
  '+2',
  '+3',
  '+4',
  '+5',
];

/** The documented implant range (`engine/types.ts`): +0..+5 per attribute. */
export const MIN_IMPLANT_BONUS = 0;
export const MAX_IMPLANT_BONUS = 5;

/**
 * What the planner is costing against.
 *
 * A preset resolves *late*, against whatever the clone is wearing right now —
 * which is what keeps "Current" honest when ESI re-reads the character's
 * implants. A custom set is the user's own five numbers, so it holds still.
 */
export type WhatIfImplantSelection =
  | { readonly kind: 'preset'; readonly preset: WhatIfImplantPreset }
  | { readonly kind: 'custom'; readonly bonuses: Implants };

/** The truth, not a hypothesis: the editor opens on the clone's real set. */
export const DEFAULT_WHAT_IF_SELECTION: WhatIfImplantSelection = {
  kind: 'preset',
  preset: 'current',
};

/**
 * A whole bonus inside +0..+5. An out-of-range number clamps to the end it
 * overshot (`Infinity` included, which is only ever an overflowed "high");
 * a NaN — a pasted word, an implausible stored value — reads as +0, because
 * the scheduler would otherwise add it to an attribute and report NaN days.
 */
function clampBonus(raw: number): number {
  if (Number.isNaN(raw)) return MIN_IMPLANT_BONUS;
  return Math.min(MAX_IMPLANT_BONUS, Math.max(MIN_IMPLANT_BONUS, Math.round(raw)));
}

/** Build a full five-slot set from a per-attribute read. */
function fill(read: (name: AttributeName) => number): Attributes {
  return {
    intelligence: clampBonus(read('intelligence')),
    memory: clampBonus(read('memory')),
    perception: clampBonus(read('perception')),
    willpower: clampBonus(read('willpower')),
    charisma: clampBonus(read('charisma')),
  };
}

/**
 * Resolve a selection to the implant bonuses fed into computeSchedule and the
 * optimizer — and, being every slot's value, to what the per-attribute inputs
 * display.
 *
 * Always all five keys, `0` for an empty slot. `Implants` is
 * `Partial<Attributes>` and every consumer reads `implants[name] ?? 0`, so a
 * full set is interchangeable with a sparse one, and having one shape means
 * the UI never has to ask "is this slot absent or is it zero".
 */
export function whatIfImplants(
  selection: WhatIfImplantSelection,
  currentImplants: Implants
): Attributes {
  if (selection.kind === 'custom') {
    const { bonuses } = selection;
    return fill((name) => bonuses[name] ?? 0);
  }
  const { preset } = selection;
  if (preset === 'none') return fill(() => 0);
  if (preset === 'current') return fill((name) => currentImplants[name] ?? 0);
  const uniform = Number(preset.slice(1));
  return fill(() => uniform);
}

/**
 * Set one slot, leaving the other four exactly as they read.
 *
 * The result is always a custom set: the moment one value diverges, the
 * selection is no longer the preset that seeded it, and saying so is what
 * keeps the control from claiming to be "+4" while training on something
 * else. Seeding through `whatIfImplants` is what makes "the other four are
 * untouched" true by construction rather than by a copy that could drift.
 */
export function setWhatIfBonus(
  selection: WhatIfImplantSelection,
  currentImplants: Implants,
  name: AttributeName,
  bonus: number
): WhatIfImplantSelection {
  return {
    kind: 'custom',
    bonuses: { ...whatIfImplants(selection, currentImplants), [name]: clampBonus(bonus) },
  };
}
