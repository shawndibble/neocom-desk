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
import type { WhatIfImplantPreset, WhatIfImplantSelection } from '@/db';
import type { AttributeName, Attributes, Implants } from '@/engine/types';

// The two persisted shapes are declared with the rest of the Skill Plan
// record in `@/db`, and imported from there by everything that touches them —
// the same way `PlanBooster` is. No re-export: a second import path for one
// type is how two modules end up disagreeing about where it lives.
//
// A preset resolves *late*, against whatever the clone is wearing right now,
// which is what keeps "Current" honest when ESI re-reads the character's
// implants. A custom set is the user's own five numbers, so it holds still.

/** The one-click sets, in picker order (the union is `WhatIfImplantPreset`). */
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

/** The truth, not a hypothesis: a plan with no stored lens opens on the clone's real set. */
export const DEFAULT_WHAT_IF_SELECTION: WhatIfImplantSelection = {
  kind: 'preset',
  preset: 'current',
};

/**
 * A whole bonus inside +0..+5. An out-of-range number clamps to the end it
 * overshot (`Infinity` included, which is only ever an overflowed "high");
 * a NaN — a pasted word, an implausible stored value — reads as +0, because
 * the scheduler would otherwise add it to an attribute and report NaN days.
 *
 * Takes `unknown`, not `number`: since the selection is persisted and synced,
 * a stored slot can hold a string, and `Math.round('abc')` is a NaN that
 * escapes both `Math.min` and `Math.max`. Typed at the door instead.
 */
function clampBonus(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.NaN;
  if (Number.isNaN(value)) return MIN_IMPLANT_BONUS;
  return Math.min(MAX_IMPLANT_BONUS, Math.max(MIN_IMPLANT_BONUS, Math.round(value)));
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

/**
 * A usable selection from whatever was stored on the plan, falling back to
 * `DEFAULT_WHAT_IF_SELECTION` when the value is not a selection at all.
 *
 * The lens is persisted and synced, so what comes back can be a doc written
 * by an older build or by another device — normalized on every read, the way
 * `markers.ts` normalizes marker positions, rather than trusted. A custom set
 * is re-clamped slot by slot for the same reason `whatIfImplants` clamps: the
 * scheduler adds these straight onto the attributes.
 */
export function normalizeWhatIfSelection(raw: unknown): WhatIfImplantSelection {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_WHAT_IF_SELECTION;
  const record = raw as Record<string, unknown>;
  if (record.kind === 'preset') {
    return WHAT_IF_IMPLANT_PRESETS.includes(record.preset as WhatIfImplantPreset)
      ? { kind: 'preset', preset: record.preset as WhatIfImplantPreset }
      : DEFAULT_WHAT_IF_SELECTION;
  }
  if (record.kind === 'custom') {
    const { bonuses } = record;
    if (typeof bonuses !== 'object' || bonuses === null) return DEFAULT_WHAT_IF_SELECTION;
    return { kind: 'custom', bonuses: fill((name) => (bonuses as Implants)[name] ?? 0) };
  }
  return DEFAULT_WHAT_IF_SELECTION;
}
