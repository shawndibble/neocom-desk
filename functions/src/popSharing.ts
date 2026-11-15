// Pop Sharing settings (issue #6222; scope: docs/context/decisions/20261115-122511-corp-tax-book-
// shares-moon-pop-schedules.md): a Corp Tax Book's Sharing default and per-moon Moon overrides,
// and the one resolver every reader uses for a moon's effective settings. Pure and
// dependency-free: the client imports it too (the Sharing tab), and the later tickets that
// publish Shared Pops (#6223 on) resolve each moon with `effectivePopSharing`.
//
// Stored at `corps/{corp}/meta/popSharing` (officers read `meta`; only the
// `editCorpTaxBookCallable` actions `setPopSharing` / `setPopSharingMoon` write it). A moon
// owner's opt-out lives on its feeder record (`corps/{corp}/feeders/{owner}.popSharingOptOut`).

import { isPlainRecord as isRecord } from './guards.js';

/** `corps/{corp}/meta/{POP_SHARING_DOC}`. */
export const POP_SHARING_DOC = 'popSharing';

/** Which instant a Shared Pop shows: the chunk's arrival, or its natural decay (Auto-fracture). */
export type PopTime = 'ready' | 'auto-fracture';
export const POP_TIMES: readonly PopTime[] = ['ready', 'auto-fracture'];

/**
 * Who sees a Shared Pop. Corp and Alliance are always the book's own corporation and its
 * alliance, never a moon owner's. A Community carries its name as the officer saw it, so the
 * Sharing tab reads without a Community lookup.
 */
export type PopAudience =
  | { kind: 'corp' }
  | { kind: 'alliance' }
  | { kind: 'community'; communityId: string; name: string };

export interface PopSharingSettings {
  audiences: PopAudience[];
  popTime: PopTime;
  /** The ore make-up shows on the Shared Pop (never ISK). */
  showOre: boolean;
  /** The start link's rate; null follows the book's own rate. */
  ratePct: number | null;
  notes: string;
}

export type PopSharingKey = keyof PopSharingSettings;
export const POP_SHARING_KEYS: readonly PopSharingKey[] = [
  'audiences',
  'popTime',
  'showOre',
  'ratePct',
  'notes',
];

/** A Moon override: only the settings that moon changed. */
export type PopSharingOverride = Partial<PopSharingSettings>;

/**
 * A change to one moon's override: `set` overrides those settings (a `ratePct` of null is the
 * book's own rate, overriding a default that names one); `clear` returns those to the default.
 */
export interface PopSharingOverridePatch {
  set: Partial<PopSharingSettings>;
  clear: PopSharingKey[];
}

export interface PopSharingDoc {
  /** Off by default; turning it on needs Automatic sync. */
  enabled: boolean;
  /** The Sharing default. */
  defaults: PopSharingSettings;
  /** Moon overrides by moon id (string). */
  moons: Record<string, PopSharingOverride>;
}

export const DEFAULT_POP_SHARING: PopSharingSettings = {
  audiences: [{ kind: 'corp' }],
  popTime: 'ready',
  showOre: true,
  ratePct: null,
  notes: '',
};

export const MAX_POP_AUDIENCES = 20;
export const MAX_POP_NOTES = 500;

type Raw = Record<string, unknown>;

function readAudience(v: unknown): PopAudience | undefined {
  if (!isRecord(v)) return undefined;
  if (v.kind === 'corp' || v.kind === 'alliance') return { kind: v.kind };
  if (v.kind === 'community' && typeof v.communityId === 'string' && v.communityId) {
    return {
      kind: 'community',
      communityId: v.communityId,
      name: typeof v.name === 'string' ? v.name : '',
    };
  }
  return undefined;
}

/** One audience's identity: two entries with the same key are the same audience. */
export const audienceKey = (a: PopAudience): string =>
  a.kind === 'community' ? `community:${a.communityId}` : a.kind;

/**
 * The settings a stored record holds, each read only when it is well formed. Lenient on purpose:
 * the callable (`popSettingsPatch` in corpTaxBook.ts) is the strict gate on what is written.
 */
function readSettings(raw: unknown): PopSharingOverride {
  if (!isRecord(raw)) return {};
  const out: PopSharingOverride = {};
  if (Array.isArray(raw.audiences)) {
    const seen = new Set<string>();
    out.audiences = raw.audiences.flatMap((x) => {
      const a = readAudience(x);
      if (!a || seen.has(audienceKey(a))) return [];
      seen.add(audienceKey(a));
      return [a];
    });
  }
  if (raw.popTime === 'ready' || raw.popTime === 'auto-fracture') out.popTime = raw.popTime;
  if (typeof raw.showOre === 'boolean') out.showOre = raw.showOre;
  if (raw.ratePct === null || (typeof raw.ratePct === 'number' && Number.isFinite(raw.ratePct)))
    out.ratePct = raw.ratePct;
  if (typeof raw.notes === 'string') out.notes = raw.notes;
  return out;
}

/** A stored `meta/popSharing` (or none) as settings: missing is sharing off, the built-in default. */
export function popSharingFrom(raw: unknown): PopSharingDoc {
  const d = isRecord(raw) ? raw : {};
  const moons: Record<string, PopSharingOverride> = {};
  if (isRecord(d.moons)) {
    for (const [id, o] of Object.entries(d.moons)) {
      if (!/^\d+$/.test(id) || !isRecord(o)) continue;
      const read = readSettings(o);
      if (Object.keys(read).length > 0) moons[id] = read;
    }
  }
  return {
    enabled: d.enabled === true,
    defaults: { ...DEFAULT_POP_SHARING, ...readSettings(d.defaults) },
    moons,
  };
}

export interface EffectivePopSharing {
  /** The default with this moon's overrides on top. */
  settings: PopSharingSettings;
  /** The settings this moon overrides, in `POP_SHARING_KEYS` order. */
  overridden: PopSharingKey[];
  /** Whether this moon's pops are published. */
  shared: boolean;
  /** Why not: sharing is off, the moon owner opted out, or no audience is left. */
  blockedBy: 'off' | 'owner-opted-out' | 'no-audience' | null;
}

/**
 * One moon's effective settings. A moon owner's opt-out keeps the book's settings for its
 * moons (they show, inert) and shares nothing until it opts in again.
 */
export function effectivePopSharing(
  doc: PopSharingDoc,
  moonId: number,
  opts: { ownerOptedOut?: boolean } = {}
): EffectivePopSharing {
  const override = doc.moons[String(moonId)] ?? {};
  const settings = { ...doc.defaults, ...override };
  const overridden = POP_SHARING_KEYS.filter((k) => override[k] !== undefined);
  const blockedBy = !doc.enabled
    ? 'off'
    : opts.ownerOptedOut
      ? 'owner-opted-out'
      : settings.audiences.length === 0
        ? 'no-audience'
        : null;
  return { settings, overridden, shared: blockedBy === null, blockedBy };
}

/** A moon's override after a patch; undefined when it overrides nothing any more. */
export function applyMoonOverride(
  current: PopSharingOverride | undefined,
  patch: PopSharingOverridePatch
): PopSharingOverride | undefined {
  const next: Raw = { ...current };
  for (const k of patch.clear) delete next[k];
  for (const k of POP_SHARING_KEYS) if (k in patch.set) next[k] = patch.set[k];
  return Object.keys(next).length > 0 ? (next as PopSharingOverride) : undefined;
}

/** The rate a Shared Pop's start link carries: the settings' own, else the book's. */
export function startLinkRatePct(settings: PopSharingSettings, bookRatePct: number): number {
  return settings.ratePct ?? bookRatePct;
}
