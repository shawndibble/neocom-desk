import { describe, expect, it } from 'vitest';
import { requiredScopesForEndpoints } from '@/esi/registry';
import { missingPermissions } from './missingPermissions';

describe('missingPermissions', () => {
  it('names the Permission of each scope the endpoints need and the grant lacks, once', () => {
    expect(
      missingPermissions(
        ['getCharacterWallet', 'getCharacterWalletJournal', 'getCharacterAssets'],
        []
      )
    ).toEqual(['wallet', 'assets']);
  });

  it('is empty once the grant holds what the endpoints need', () => {
    const granted = requiredScopesForEndpoints(['getCharacterWallet', 'getCharacterAssets']);
    expect(missingPermissions(['getCharacterWallet', 'getCharacterAssets'], granted)).toEqual([]);
  });

  it('names only what is still missing', () => {
    const granted = requiredScopesForEndpoints(['getCharacterWallet']);
    expect(missingPermissions(['getCharacterWallet', 'getCharacterAssets'], granted)).toEqual([
      'assets',
    ]);
  });
});
