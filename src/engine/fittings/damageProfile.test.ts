import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_DAMAGE_PROFILES,
  UNIFORM_DAMAGE_PROFILE_ID,
  isValidDamageProfile,
  newCustomDamageProfileId,
  parseCustomDamageProfiles,
  parseSelectedDamageProfileId,
  resolveDamageProfile,
  type CustomDamageProfile,
} from './damageProfile';

const custom: CustomDamageProfile = {
  id: 'custom:abc',
  name: 'My rats',
  em: 1,
  thermal: 2,
  kinetic: 0,
  explosive: 0,
};

describe('BUILT_IN_DAMAGE_PROFILES', () => {
  it('starts with uniform, then the four pure types', () => {
    expect(BUILT_IN_DAMAGE_PROFILES.slice(0, 5).map((p) => p.id)).toEqual([
      UNIFORM_DAMAGE_PROFILE_ID,
      'builtin:em',
      'builtin:thermal',
      'builtin:kinetic',
      'builtin:explosive',
    ]);
  });

  it('includes the common NPC factions', () => {
    const ids = BUILT_IN_DAMAGE_PROFILES.map((p) => p.id);
    for (const faction of ['guristas', 'serpentis', 'bloodRaiders', 'sansha', 'angelCartel']) {
      expect(ids).toContain(`builtin:${faction}`);
    }
  });

  it('every built-in is a usable profile with a unique id', () => {
    const ids = new Set(BUILT_IN_DAMAGE_PROFILES.map((p) => p.id));
    expect(ids.size).toBe(BUILT_IN_DAMAGE_PROFILES.length);
    for (const p of BUILT_IN_DAMAGE_PROFILES) expect(isValidDamageProfile(p)).toBe(true);
  });
});

describe('resolveDamageProfile', () => {
  it('resolves a built-in id', () => {
    const resolved = resolveDamageProfile('builtin:guristas', []);
    expect(resolved.id).toBe('builtin:guristas');
    expect(resolved.kinetic).toBeGreaterThan(resolved.thermal);
    expect(resolved.em).toBe(0);
  });

  it('resolves a custom id', () => {
    expect(resolveDamageProfile('custom:abc', [custom])).toEqual(custom);
  });

  it('falls back to uniform for a stale or deleted id', () => {
    expect(resolveDamageProfile('custom:gone', [custom]).id).toBe(UNIFORM_DAMAGE_PROFILE_ID);
    expect(resolveDamageProfile(undefined, []).id).toBe(UNIFORM_DAMAGE_PROFILE_ID);
  });
});

describe('isValidDamageProfile', () => {
  it('rejects negative, non-finite and all-zero mixes', () => {
    expect(isValidDamageProfile({ em: -1, thermal: 1, kinetic: 1, explosive: 1 })).toBe(false);
    expect(isValidDamageProfile({ em: Number.NaN, thermal: 1, kinetic: 1, explosive: 1 })).toBe(
      false
    );
    expect(isValidDamageProfile({ em: 0, thermal: 0, kinetic: 0, explosive: 0 })).toBe(false);
    expect(isValidDamageProfile({ em: 0, thermal: 0, kinetic: 3, explosive: 0 })).toBe(true);
  });
});

describe('parseCustomDamageProfiles', () => {
  it('keeps well-formed entries and drops the rest', () => {
    expect(
      parseCustomDamageProfiles([
        custom,
        { ...custom, id: 'custom:zero', em: 0, thermal: 0 },
        { ...custom, id: 'builtin:em' },
        { ...custom, id: 'custom:noname', name: '  ' },
        { ...custom, id: 'custom:neg', kinetic: -2 },
        'nonsense',
        null,
      ])
    ).toEqual([custom]);
  });

  it('drops a repeated id, keeping the first', () => {
    expect(parseCustomDamageProfiles([custom, { ...custom, name: 'Dupe' }])).toEqual([custom]);
  });

  it('returns an empty list for anything not an array', () => {
    expect(parseCustomDamageProfiles({})).toEqual([]);
    expect(parseCustomDamageProfiles(undefined)).toEqual([]);
  });
});

describe('parseSelectedDamageProfileId', () => {
  it('keeps a string, defaults anything else to uniform', () => {
    expect(parseSelectedDamageProfileId('custom:abc')).toBe('custom:abc');
    expect(parseSelectedDamageProfileId(3)).toBe(UNIFORM_DAMAGE_PROFILE_ID);
  });
});

describe('newCustomDamageProfileId', () => {
  it('is custom-prefixed so it can never collide with a built-in', () => {
    expect(newCustomDamageProfileId().startsWith('custom:')).toBe(true);
  });
});
