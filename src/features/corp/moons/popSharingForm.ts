/**
 * The Sharing tab's editor state (issue #6222): the settings as form fields, and the patch
 * an edit sends. A default edit sends only what changed; a moon edit sends each setting the
 * moon now overrides and null for one that follows the Sharing default again.
 */
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
  /** The start link's rate as typed; empty is the book's own rate. */
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

/** The settings a draft holds, or null when its rate is not a number 0-100. */
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

/** The Sharing default settings that changed. */
export function defaultsPatch(
  current: PopSharingSettings,
  next: PopSharingSettings
): Partial<PopSharingSettings> {
  const out: Record<string, unknown> = {};
  for (const k of POP_SHARING_KEYS) if (!same(current[k], next[k])) out[k] = next[k];
  return out as Partial<PopSharingSettings>;
}

/**
 * One moon's change: `overriding` names the settings the moon sets for itself, taken from
 * `next`; any other it overrode now follows the default (null).
 */
export function moonPatch(
  current: PopSharingOverride,
  next: PopSharingSettings,
  overriding: ReadonlySet<PopSharingKey>
): PopSharingOverridePatch {
  const out: Record<string, unknown> = {};
  for (const k of POP_SHARING_KEYS) {
    if (overriding.has(k)) {
      if (!same(current[k], next[k])) out[k] = next[k];
    } else if (current[k] !== undefined) out[k] = null;
  }
  return out as PopSharingOverridePatch;
}
