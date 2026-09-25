/**
 * Target Profiles (CONTEXT.md): the signature radius and speed of an
 * imagined target a Fitting's applied DPS is worked out against. Pure; the
 * synced-setting stores live in `features/fittings/targetProfiles.ts`.
 * Mirrors `damageProfile.ts` — same id scheme, same strict parse.
 */

export interface TargetProfile {
  /** Metres. */
  signatureRadius: number;
  /** Metres per second — assumed to be fully transversal to the shooter. */
  velocity: number;
}

/** A profile the picker offers. Built-in ids are `builtin:*`, custom ones `custom:*`, so they never collide. */
export interface NamedTargetProfile extends TargetProfile {
  id: string;
}

export const CUSTOM_TARGET_PROFILE_ID_PREFIX = 'custom:';

/** A pilot-authored profile; synced across devices as `sync.fittingTargetProfiles`. */
export interface CustomTargetProfile extends NamedTargetProfile {
  name: string;
}

export const DEFAULT_TARGET_PROFILE_ID = 'builtin:cruiser';

function builtIn(key: string, signatureRadius: number, velocity: number): NamedTargetProfile {
  return { id: `builtin:${key}`, signatureRadius, velocity };
}

/**
 * Picker order is this array's order. Pyfa's own target profiles
 * (`eos/saveddata/targetProfile.py`, read 2026-09-24) carry sig/speed only
 * for individual Burner NPCs, never a generic class, so these are our own
 * round figures for a typical pirate rat of each class — roughly the base
 * signature and cruise speed of the player hulls those NPCs are modelled on
 * (a Rifter-class frigate ~35 m, a cruiser ~125 m, a battleship ~400 m).
 * A pilot who wants a specific target authors a custom profile.
 * A built-in's display name is the i18n key `fittings.targetProfile.builtin.<key>`.
 */
export const BUILT_IN_TARGET_PROFILES: readonly NamedTargetProfile[] = [
  builtIn('frigate', 35, 400),
  builtIn('cruiser', 125, 200),
  builtIn('battleship', 400, 100),
];

const DEFAULT_PROFILE = BUILT_IN_TARGET_PROFILES.find((p) => p.id === DEFAULT_TARGET_PROFILE_ID)!;

/** The i18n key suffix of a built-in (`builtin:frigate` → `frigate`), `null` for a custom id. */
export function builtInTargetProfileKey(id: string): string | null {
  return id.startsWith('builtin:') ? id.slice('builtin:'.length) : null;
}

/** A finite, positive signature (applied damage divides by it) and a finite, non-negative speed. */
export function isValidTargetProfile(profile: TargetProfile): boolean {
  const { signatureRadius, velocity } = profile;
  return (
    typeof signatureRadius === 'number' &&
    Number.isFinite(signatureRadius) &&
    signatureRadius > 0 &&
    typeof velocity === 'number' &&
    Number.isFinite(velocity) &&
    velocity >= 0
  );
}

/** The selected profile, or the default when the id names nothing (never set, or a since-deleted custom one). */
export function resolveTargetProfile(
  selectedId: string | undefined,
  custom: readonly CustomTargetProfile[]
): NamedTargetProfile {
  return (
    BUILT_IN_TARGET_PROFILES.find((p) => p.id === selectedId) ??
    custom.find((p) => p.id === selectedId) ??
    DEFAULT_PROFILE
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Strict parse of the synced custom-profile list — pulled values may come from another build. */
export function parseCustomTargetProfiles(raw: unknown): CustomTargetProfile[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomTargetProfile[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const { id, name, signatureRadius, velocity } = entry;
    if (typeof id !== 'string' || !id.startsWith(CUSTOM_TARGET_PROFILE_ID_PREFIX) || seen.has(id))
      continue;
    if (typeof name !== 'string' || name.trim() === '') continue;
    const profile = { id, name, signatureRadius, velocity } as CustomTargetProfile;
    if (!isValidTargetProfile(profile)) continue;
    seen.add(id);
    out.push(profile);
  }
  return out;
}

export function parseSelectedTargetProfileId(raw: unknown): string {
  return typeof raw === 'string' ? raw : DEFAULT_TARGET_PROFILE_ID;
}
