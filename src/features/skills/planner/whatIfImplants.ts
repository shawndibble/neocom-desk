import type { WhatIfImplantPreset, WhatIfImplantSelection } from '@/db';
import type { AttributeName, Attributes, Implants } from '@/engine/types';

export const WHAT_IF_IMPLANT_PRESETS: readonly WhatIfImplantPreset[] = [
  'none',
  'current',
  '+1',
  '+2',
  '+3',
  '+4',
  '+5',
];

export const MIN_IMPLANT_BONUS = 0;
export const MAX_IMPLANT_BONUS = 5;

export const DEFAULT_WHAT_IF_SELECTION: WhatIfImplantSelection = {
  kind: 'preset',
  preset: 'current',
};

function clampBonus(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.NaN;
  if (Number.isNaN(value)) return MIN_IMPLANT_BONUS;
  return Math.min(MAX_IMPLANT_BONUS, Math.max(MIN_IMPLANT_BONUS, Math.round(value)));
}

function fill(read: (name: AttributeName) => number): Attributes {
  return {
    intelligence: clampBonus(read('intelligence')),
    memory: clampBonus(read('memory')),
    perception: clampBonus(read('perception')),
    willpower: clampBonus(read('willpower')),
    charisma: clampBonus(read('charisma')),
  };
}

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

export function toCustomSelection(
  selection: WhatIfImplantSelection,
  currentImplants: Implants
): WhatIfImplantSelection {
  return { kind: 'custom', bonuses: whatIfImplants(selection, currentImplants) };
}

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

export function readsLoadedImplants(raw: unknown): boolean {
  const selection = normalizeWhatIfSelection(raw);
  return selection.kind === 'preset' && selection.preset === 'current';
}

export interface JumpCloneImplantSet {
  id: number;
  label: string;
  bonuses: Implants;
}

export function cloneSelection(clone: JumpCloneImplantSet): WhatIfImplantSelection {
  return { kind: 'custom', bonuses: fill((name) => clone.bonuses[name] ?? 0) };
}

export function matchingCloneId(
  selection: WhatIfImplantSelection,
  currentImplants: Implants,
  clones: readonly JumpCloneImplantSet[]
): number | null {
  if (selection.kind !== 'custom') return null;
  const resolved = whatIfImplants(selection, currentImplants);
  const match = clones.find((clone) => {
    const set = whatIfImplants(cloneSelection(clone), currentImplants);
    return (Object.keys(set) as AttributeName[]).every((name) => set[name] === resolved[name]);
  });
  return match?.id ?? null;
}

export function isHypotheticalLens(selection: WhatIfImplantSelection): boolean {
  return !(selection.kind === 'preset' && selection.preset === 'current');
}

export interface WhatIfVerdict {
  kind: 'saves' | 'costs' | 'same';
  seconds: number;
}

export function whatIfVerdict(currentSeconds: number, whatIfSeconds: number): WhatIfVerdict {
  const delta = Math.round(currentSeconds - whatIfSeconds);
  if (delta === 0) return { kind: 'same', seconds: 0 };
  return { kind: delta > 0 ? 'saves' : 'costs', seconds: Math.abs(delta) };
}
