import { db, type CharacterRecord, type TokenRecord } from '@/db';

export async function seedCharacter(
  characterId: number,
  name = `Pilot ${characterId}`,
  overrides: Partial<CharacterRecord> = {}
): Promise<void> {
  await db.characters.put({
    characterId,
    name,
    ownerHash: `hash-${characterId}`,
    addedAt: 1,
    ...overrides,
  });
}

export async function seedGrant(
  characterId: number,
  scopes: readonly string[],
  overrides: Partial<TokenRecord> = {}
): Promise<void> {
  await db.tokens.put({
    characterId,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60_000,
    scopes: [...scopes],
    ...overrides,
  });
}
