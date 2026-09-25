/**
 * Damage Profiles (CONTEXT.md): the incoming damage mix a Fitting's EHP is
 * measured against. Only the ratio matters — the engine normalises the four
 * numbers to sum to 1 — so built-ins and custom profiles alike are stored as
 * plain relative weights. Pure; the synced-setting stores live in
 * `features/fittings/damageProfiles.ts`.
 */
import type { DamageProfile } from './types';

/** A profile the picker offers. Built-in ids are `builtin:*`, custom ones `custom:*`, so they never collide. */
export interface NamedDamageProfile extends DamageProfile {
  id: string;
}

export const CUSTOM_DAMAGE_PROFILE_ID_PREFIX = 'custom:';

/** A pilot-authored profile; synced across devices as `sync.fittingDamageProfiles`. */
export interface CustomDamageProfile extends NamedDamageProfile {
  name: string;
}

export const UNIFORM_DAMAGE_PROFILE_ID = 'builtin:uniform';

function builtIn(
  key: string,
  em: number,
  thermal: number,
  kinetic: number,
  explosive: number
): NamedDamageProfile {
  return { id: `builtin:${key}`, em, thermal, kinetic, explosive };
}

/**
 * Picker order is this array's order. The NPC rows are Pyfa's own built-in
 * damage patterns (`eos/saveddata/damagePattern.py`, `BUILTINS`, columns
 * em/thermal/kinetic/explosive — its Generic EM/Thermal rows confirm the
 * order), read from pyfa-org/Pyfa master on 2026-09-24: the "[NPC][Asteroid]"
 * rows for the pirate factions and Rogue Drones, "[NPC][Mission]" for Mordu's
 * Legion, "[NPC][Abyssal]" for Triglavians and "[NPC]" for Sleepers.
 * A built-in's display name is the i18n key `fittings.damageProfile.builtin.<key>`.
 */
export const BUILT_IN_DAMAGE_PROFILES: readonly NamedDamageProfile[] = [
  builtIn('uniform', 25, 25, 25, 25),
  builtIn('em', 1, 0, 0, 0),
  builtIn('thermal', 0, 1, 0, 0),
  builtIn('kinetic', 0, 0, 1, 0),
  builtIn('explosive', 0, 0, 0, 1),
  builtIn('angelCartel', 1838, 562, 2215, 3838),
  builtIn('bloodRaiders', 5067, 4214, 0, 0),
  builtIn('guristas', 0, 1828, 7413, 0),
  builtIn('rogueDrones', 394, 666, 1090, 1687),
  builtIn('sansha', 5586, 4112, 0, 0),
  builtIn('serpentis', 0, 5373, 4813, 0),
  builtIn('mordusLegion', 25, 262, 625, 0),
  builtIn('triglavian', 0, 615, 0, 385),
  builtIn('sleepers', 1472, 1472, 1384, 1384),
];

const UNIFORM = BUILT_IN_DAMAGE_PROFILES[0];

/** The i18n key suffix of a built-in (`builtin:guristas` → `guristas`), `null` for a custom id. */
export function builtInDamageProfileKey(id: string): string | null {
  return id.startsWith('builtin:') ? id.slice('builtin:'.length) : null;
}

/** Four finite, non-negative weights with something in them — an all-zero mix has no ratio to normalise. */
export function isValidDamageProfile(profile: DamageProfile): boolean {
  const values = [profile.em, profile.thermal, profile.kinetic, profile.explosive];
  return (
    values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0) &&
    values.some((value) => value > 0)
  );
}

/** The selected profile, or uniform when the id names nothing (never set, or a since-deleted custom one). */
export function resolveDamageProfile(
  selectedId: string | undefined,
  custom: readonly CustomDamageProfile[]
): NamedDamageProfile {
  return (
    BUILT_IN_DAMAGE_PROFILES.find((p) => p.id === selectedId) ??
    custom.find((p) => p.id === selectedId) ??
    UNIFORM
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Strict parse of the synced custom-profile list — pulled values may come from another build. */
export function parseCustomDamageProfiles(raw: unknown): CustomDamageProfile[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomDamageProfile[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const { id, name, em, thermal, kinetic, explosive } = entry;
    if (typeof id !== 'string' || !id.startsWith(CUSTOM_DAMAGE_PROFILE_ID_PREFIX) || seen.has(id))
      continue;
    if (typeof name !== 'string' || name.trim() === '') continue;
    const profile = { id, name, em, thermal, kinetic, explosive } as CustomDamageProfile;
    if (!isValidDamageProfile(profile)) continue;
    seen.add(id);
    out.push(profile);
  }
  return out;
}

export function parseSelectedDamageProfileId(raw: unknown): string {
  return typeof raw === 'string' ? raw : UNIFORM_DAMAGE_PROFILE_ID;
}
