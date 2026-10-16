import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  deleteCommunitySnapshots,
  loadCommunitySnapshot,
  saveCommunitySnapshot,
} from './communityCache';

const list = [{ id: 'c1', name: 'Pals', adminUid: 'char:1', inviteCode: null, memberCount: 2 }];

describe('communityCache', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('returns null when nothing was saved', async () => {
    expect(await loadCommunitySnapshot(1, 'list')).toBeNull();
  });

  it('round-trips a snapshot', async () => {
    await saveCommunitySnapshot(1, 'list', list);
    expect(await loadCommunitySnapshot(1, 'list')).toEqual(list);
  });

  it('scopes a snapshot per Character and per Community', async () => {
    await saveCommunitySnapshot(1, 'members', [{ uid: 'a' }], 'c1');
    expect(await loadCommunitySnapshot(2, 'members', 'c1')).toBeNull();
    expect(await loadCommunitySnapshot(1, 'members', 'c2')).toBeNull();
    expect(await loadCommunitySnapshot(1, 'members', 'c1')).toEqual([{ uid: 'a' }]);
  });

  it('purges one Character without touching another with a longer id', async () => {
    await saveCommunitySnapshot(1, 'list', list);
    await saveCommunitySnapshot(1, 'members', [], 'c1');
    await saveCommunitySnapshot(10, 'list', list);
    await deleteCommunitySnapshots(1);
    expect(await loadCommunitySnapshot(1, 'list')).toBeNull();
    expect(await loadCommunitySnapshot(1, 'members', 'c1')).toBeNull();
    expect(await loadCommunitySnapshot(10, 'list')).toEqual(list);
  });

  it('survives a failing write', async () => {
    await expect(saveCommunitySnapshot(1, 'list', () => 1)).resolves.toBeUndefined();
  });
});
