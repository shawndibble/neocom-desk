import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { seedGrant } from '@/test/seed';
import {
  loadGrantedScopes,
  loadGrantedScopesByCharacter,
  useGrantedScopesByCharacter,
} from './grantedScopes';

beforeEach(async () => {
  await db.tokens.clear();
});

describe('loadGrantedScopes', () => {
  it('returns the scopes the token holds', async () => {
    await seedGrant(1, ['a', 'b']);
    expect(await loadGrantedScopes(1)).toEqual(new Set(['a', 'b']));
  });

  it('is empty without a token row', async () => {
    expect((await loadGrantedScopes(99)).size).toBe(0);
  });
});

describe('loadGrantedScopesByCharacter', () => {
  it('keys each Character to its scopes', async () => {
    await seedGrant(1, ['a']);
    await seedGrant(2, []);
    const all = await loadGrantedScopesByCharacter();
    expect(all.get(1)).toEqual(new Set(['a']));
    expect(all.get(2)?.size).toBe(0);
    expect(all.has(3)).toBe(false);
  });
});

describe('useGrantedScopesByCharacter', () => {
  it('is undefined until read, then follows the tokens', async () => {
    await seedGrant(1, ['a']);
    const { result } = renderHook(() => useGrantedScopesByCharacter());
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current?.get(1)).toEqual(new Set(['a'])));
    await seedGrant(2, ['b']);
    await waitFor(() => expect(result.current?.get(2)).toEqual(new Set(['b'])));
  });
});
