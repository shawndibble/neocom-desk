import { isPlainRecord as isRecord } from './guards.js';

export const POP_SHARING_DOC = 'popSharing';

export type PopTime = 'ready' | 'auto-fracture';
export const POP_TIMES: readonly PopTime[] = ['ready', 'auto-fracture'];

export type PopAudience =
  | { kind: 'corp' }
  | { kind: 'alliance' }
  | { kind: 'community'; communityId: string; name: string };

export interface PopSharingSettings {
  audiences: PopAudience[];
  popTime: PopTime;
  showOre: boolean;
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

export type PopSharingOverride = Partial<PopSharingSettings>;

export interface PopSharingOverridePatch {
  set: Partial<PopSharingSettings>;
  clear: PopSharingKey[];
}

export interface PopSharingDoc {
  enabled: boolean;
  defaults: PopSharingSettings;
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

export const audienceKey = (a: PopAudience): string =>
  a.kind === 'community' ? `community:${a.communityId}` : a.kind;

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
  settings: PopSharingSettings;
  overridden: PopSharingKey[];
  shared: boolean;
  blockedBy: 'off' | 'owner-opted-out' | 'no-audience' | null;
}

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

export function applyMoonOverride(
  current: PopSharingOverride | undefined,
  patch: PopSharingOverridePatch
): PopSharingOverride | undefined {
  const next: Raw = { ...current };
  for (const k of patch.clear) delete next[k];
  for (const k of POP_SHARING_KEYS) if (k in patch.set) next[k] = patch.set[k];
  return Object.keys(next).length > 0 ? (next as PopSharingOverride) : undefined;
}

export function startLinkRatePct(settings: PopSharingSettings, bookRatePct: number): number {
  return settings.ratePct ?? bookRatePct;
}
