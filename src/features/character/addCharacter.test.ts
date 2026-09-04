import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { addCharacter } from './addCharacter';

const mocks = vi.hoisted(() => ({
  completeLogin: vi.fn(),
  backfillAccountWideData: vi.fn(async () => false),
  scheduleSync: vi.fn(),
}));
vi.mock('@/auth/session', () => ({ completeLogin: mocks.completeLogin }));
vi.mock('@/sync', () => ({
  backfillAccountWideData: mocks.backfillAccountWideData,
  scheduleSync: mocks.scheduleSync,
}));

const PARAMS = { code: 'c', state: 's' };

function characterRecord(characterId: number) {
  return {
    characterId,
    name: `Pilot ${characterId}`,
    ownerHash: `hash-${characterId}`,
    addedAt: 1,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.backfillAccountWideData.mockImplementation(async () => false);
  await db.characters.clear();
});

describe('addCharacter', () => {
  it('backfills account-wide data for a Character this device has never seen', async () => {
    await db.characters.put(characterRecord(1));
    mocks.completeLogin.mockResolvedValue(characterRecord(2));

    await addCharacter(PARAMS);

    expect(mocks.backfillAccountWideData).toHaveBeenCalledWith(2);
  });

  it('does not backfill a Character that was already on this device', async () => {
    // Re-authenticating an existing Character — a re-grant for new scopes, or
    // a sold Character coming back under a new ownerHash whose Editable Data
    // `handleOwnerHashChange` has just purged on purpose. Re-seeding here
    // would undo that purge.
    await db.characters.put(characterRecord(2));
    mocks.completeLogin.mockResolvedValue(characterRecord(2));

    await addCharacter(PARAMS);

    expect(mocks.backfillAccountWideData).not.toHaveBeenCalled();
  });

  it('schedules a sync only when the backfill actually wrote something', async () => {
    mocks.completeLogin.mockResolvedValue(characterRecord(2));
    mocks.backfillAccountWideData.mockResolvedValue(true);

    await addCharacter(PARAMS);

    expect(mocks.scheduleSync).toHaveBeenCalledWith(2);
  });

  it('schedules no sync when the backfill wrote nothing', async () => {
    mocks.completeLogin.mockResolvedValue(characterRecord(2));

    await addCharacter(PARAMS);

    expect(mocks.scheduleSync).not.toHaveBeenCalled();
  });

  it('backfills even with sync unconfigured — the copy is a local Dexie write', async () => {
    // `removeCharacter` gates its remote purge on `isSyncConfigured()` because
    // that operation talks to a backend. This one does not: an account-wide
    // pin is just as much the new Character's on a device that never syncs.
    await db.characters.put(characterRecord(1));
    mocks.completeLogin.mockResolvedValue(characterRecord(2));

    await addCharacter(PARAMS);

    expect(mocks.backfillAccountWideData).toHaveBeenCalledWith(2);
  });

  it('returns the Character, so the callback route can activate it', async () => {
    mocks.completeLogin.mockResolvedValue(characterRecord(2));

    expect(await addCharacter(PARAMS)).toMatchObject({ characterId: 2 });
  });

  it('never lets a failed backfill cost the user their login', async () => {
    // The login has already completed and the token is stored by this point.
    // Throwing here would send the callback route to its error panel for a
    // Character that is, in fact, signed in.
    await db.characters.put(characterRecord(1));
    mocks.completeLogin.mockResolvedValue(characterRecord(2));
    mocks.backfillAccountWideData.mockRejectedValue(new Error('Dexie is having a day'));

    expect(await addCharacter(PARAMS)).toMatchObject({ characterId: 2 });
  });

  it('propagates a login failure rather than swallowing it', async () => {
    mocks.completeLogin.mockRejectedValue(new Error('SSO state mismatch'));

    await expect(addCharacter(PARAMS)).rejects.toThrow('SSO state mismatch');
    expect(mocks.backfillAccountWideData).not.toHaveBeenCalled();
  });
});
