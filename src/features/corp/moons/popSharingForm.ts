import {
  POP_SHARING_KEYS,
  type PopAudience,
  type PopSharingKey,
  type PopSharingOverride,
  type PopSharingOverridePatch,
  type PopSharingSettings,
  type PopTime,
} from '../../../../functions/src/popSharing';

export interface SettingsDraft {
  audiences: PopAudience[];
  popTime: PopTime;
  showOre: boolean;
  rate: string;
  notes: string;
}

export function draftOf(s: PopSharingSettings): SettingsDraft {
  return {
    audiences: s.audiences,
    popTime: s.popTime,
    showOre: s.showOre,
    rate: s.ratePct === null ? '' : String(s.ratePct),
    notes: s.notes,
  };
}

export function settingsOfDraft(d: SettingsDraft): PopSharingSettings | null {
  const typed = d.rate.trim();
  const ratePct = typed === '' ? null : Number(typed);
  if (ratePct !== null && (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100)) return null;
  return {
    audiences: d.audiences,
    popTime: d.popTime,
    showOre: d.showOre,
    ratePct,
    notes: d.notes.trim(),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function defaultsPatch(
  current: PopSharingSettings,
  next: PopSharingSettings
): Partial<PopSharingSettings> {
  const out: Record<string, unknown> = {};
  for (const k of POP_SHARING_KEYS) if (!same(current[k], next[k])) out[k] = next[k];
  return out as Partial<PopSharingSettings>;
}

export function moonPatch(
  current: PopSharingOverride,
  next: PopSharingSettings,
  overriding: ReadonlySet<PopSharingKey>
): PopSharingOverridePatch {
  const set: Record<string, unknown> = {};
  const clear: PopSharingKey[] = [];
  for (const k of POP_SHARING_KEYS) {
    if (overriding.has(k)) {
      if (current[k] === undefined || !same(current[k], next[k])) set[k] = next[k];
    } else if (current[k] !== undefined) clear.push(k);
  }
  return { set: set as Partial<PopSharingSettings>, clear };
}

export const isEmptyPatch = (p: Partial<PopSharingSettings> | PopSharingOverridePatch): boolean =>
  'clear' in p && 'set' in p
    ? p.clear.length === 0 && Object.keys(p.set).length === 0
    : Object.keys(p).length === 0;
