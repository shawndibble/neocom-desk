import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_TARGET_PROFILES,
  DEFAULT_TARGET_PROFILE_ID,
  builtInTargetProfileKey,
  isValidTargetProfile,
  parseCustomTargetProfiles,
  parseSelectedTargetProfileId,
  resolveTargetProfile,
} from './targetProfile';

describe('target profiles', () => {
  it('offers the frigate, cruiser and battleship NPC classes, smallest first', () => {
    expect(BUILT_IN_TARGET_PROFILES.map((p) => p.id)).toEqual([
      'builtin:frigate',
      'builtin:cruiser',
      'builtin:battleship',
    ]);
    const [frigate, cruiser, battleship] = BUILT_IN_TARGET_PROFILES;
    expect(frigate.signatureRadius).toBeLessThan(cruiser.signatureRadius);
    expect(cruiser.signatureRadius).toBeLessThan(battleship.signatureRadius);
    expect(frigate.velocity).toBeGreaterThan(battleship.velocity);
  });

  it('names built-ins by key and custom ones not at all', () => {
    expect(builtInTargetProfileKey('builtin:cruiser')).toBe('cruiser');
    expect(builtInTargetProfileKey('custom:abc')).toBeNull();
  });

  it('needs a finite positive signature and a finite non-negative speed', () => {
    expect(isValidTargetProfile({ signatureRadius: 40, velocity: 0 })).toBe(true);
    expect(isValidTargetProfile({ signatureRadius: 0, velocity: 100 })).toBe(false);
    expect(isValidTargetProfile({ signatureRadius: 40, velocity: -1 })).toBe(false);
    expect(isValidTargetProfile({ signatureRadius: Number.NaN, velocity: 1 })).toBe(false);
    expect(isValidTargetProfile({ signatureRadius: Infinity, velocity: 1 })).toBe(false);
  });

  it('resolves the selection, falling back to the default for an unknown id', () => {
    const custom = [{ id: 'custom:a', name: 'Kiting frig', signatureRadius: 30, velocity: 2500 }];
    expect(resolveTargetProfile('custom:a', custom)).toBe(custom[0]);
    expect(resolveTargetProfile('builtin:frigate', custom).id).toBe('builtin:frigate');
    expect(resolveTargetProfile('custom:gone', custom).id).toBe(DEFAULT_TARGET_PROFILE_ID);
    expect(resolveTargetProfile(undefined, custom).id).toBe(DEFAULT_TARGET_PROFILE_ID);
  });

  it('parses the synced custom list strictly', () => {
    expect(parseCustomTargetProfiles('nope')).toEqual([]);
    expect(
      parseCustomTargetProfiles([
        { id: 'custom:a', name: 'A', signatureRadius: 30, velocity: 2500 },
        { id: 'custom:a', name: 'Dupe', signatureRadius: 30, velocity: 2500 },
        { id: 'builtin:x', name: 'Wrong prefix', signatureRadius: 30, velocity: 1 },
        { id: 'custom:b', name: ' ', signatureRadius: 30, velocity: 1 },
        { id: 'custom:c', name: 'No sig', signatureRadius: 0, velocity: 1 },
        { id: 'custom:d', name: 'Text', signatureRadius: '30', velocity: 1 },
        null,
      ])
    ).toEqual([{ id: 'custom:a', name: 'A', signatureRadius: 30, velocity: 2500 }]);
  });

  it('parses the selected id, defaulting non-strings', () => {
    expect(parseSelectedTargetProfileId('custom:a')).toBe('custom:a');
    expect(parseSelectedTargetProfileId(3)).toBe(DEFAULT_TARGET_PROFILE_ID);
  });
});
