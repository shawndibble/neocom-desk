import { isRecord } from '../guards';
import type { PerDamageType } from './types';

export type TargetResists = PerDamageType;

export const NO_RESISTS: TargetResists = { em: 0, thermal: 0, kinetic: 0, explosive: 0 };

export interface TargetProfile {
  signatureRadius: number;
  velocity: number;
  resists?: TargetResists;
}

export function targetResists(profile: TargetProfile): TargetResists {
  return profile.resists ?? NO_RESISTS;
}

const RESIST_TYPES = ['em', 'thermal', 'kinetic', 'explosive'] as const;

function isValidResists(resists: unknown): resists is TargetResists {
  if (typeof resists !== 'object' || resists === null) return false;
  return RESIST_TYPES.every((type) => {
    const value = (resists as Record<string, unknown>)[type];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  });
}

export interface NamedTargetProfile extends TargetProfile {
  id: string;
}

export const CUSTOM_TARGET_PROFILE_ID_PREFIX = 'custom:';

export interface CustomTargetProfile extends NamedTargetProfile {
  name: string;
}

export const DEFAULT_TARGET_PROFILE_ID = 'builtin:cruiser';

function builtIn(key: string, signatureRadius: number, velocity: number): NamedTargetProfile {
  return { id: `builtin:${key}`, signatureRadius, velocity };
}

export const BUILT_IN_TARGET_PROFILES: readonly NamedTargetProfile[] = [
  builtIn('frigate', 35, 400),
  builtIn('cruiser', 125, 200),
  builtIn('battleship', 400, 100),
];

const DEFAULT_PROFILE = BUILT_IN_TARGET_PROFILES.find((p) => p.id === DEFAULT_TARGET_PROFILE_ID)!;

export function builtInTargetProfileKey(id: string): string | null {
  return id.startsWith('builtin:') ? id.slice('builtin:'.length) : null;
}

export function isValidTargetProfile(profile: TargetProfile): boolean {
  const { signatureRadius, velocity, resists } = profile;
  return (
    typeof signatureRadius === 'number' &&
    Number.isFinite(signatureRadius) &&
    signatureRadius > 0 &&
    typeof velocity === 'number' &&
    Number.isFinite(velocity) &&
    velocity >= 0 &&
    (resists === undefined || isValidResists(resists))
  );
}

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

export function parseCustomTargetProfiles(raw: unknown): CustomTargetProfile[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomTargetProfile[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const { id, name, signatureRadius, velocity, resists } = entry;
    if (typeof id !== 'string' || !id.startsWith(CUSTOM_TARGET_PROFILE_ID_PREFIX) || seen.has(id))
      continue;
    if (typeof name !== 'string' || name.trim() === '') continue;
    const profile = {
      id,
      name,
      signatureRadius,
      velocity,
      ...(resists === undefined ? {} : { resists }),
    } as CustomTargetProfile;
    if (!isValidTargetProfile(profile)) continue;
    seen.add(id);
    out.push(profile);
  }
  return out;
}

export function parseSelectedTargetProfileId(raw: unknown): string {
  return typeof raw === 'string' ? raw : DEFAULT_TARGET_PROFILE_ID;
}
