import { isRecord } from '../guards';
import type { DamageProfile } from './types';

export interface NamedDamageProfile extends DamageProfile {
  id: string;
}

export const CUSTOM_DAMAGE_PROFILE_ID_PREFIX = 'custom:';

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

export function builtInDamageProfileKey(id: string): string | null {
  return id.startsWith('builtin:') ? id.slice('builtin:'.length) : null;
}

export function isValidDamageProfile(profile: DamageProfile): boolean {
  const values = [profile.em, profile.thermal, profile.kinetic, profile.explosive];
  return (
    values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0) &&
    values.some((value) => value > 0)
  );
}

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
