import { vi } from 'vitest';
export { pwaRegisterMock } from '@/test/assetsMocks';
import type { SkillType } from '@/sde/types';
import { IDLE_SYNC_STATUS } from '@/sync/statusFixtures';

export const markPlanDeletedMock = vi.fn(async (_characterId: number, id: string) => {
  const { db } = await import('@/db');
  await db.skillPlans.delete(id);
});
export const scheduleSyncMock = vi.fn();
export const triggerSyncMock = vi
  .fn<(characterId: number) => Promise<void>>()
  .mockResolvedValue(undefined);
export const idleSubscribe = (listener: (s: unknown) => void) => {
  listener({ state: 'idle', lastSyncedAt: null, error: null });
  return () => {};
};
export const subscribeSyncStatusMock = vi.fn(idleSubscribe);

export const syncMock = () => ({
  getSyncStatus: () => IDLE_SYNC_STATUS,
  markPlanDeleted: (characterId: number, id: string) => markPlanDeletedMock(characterId, id),
  scheduleSync: (characterId: number) => scheduleSyncMock(characterId),
  triggerSync: (characterId: number) => triggerSyncMock(characterId),
  subscribeSyncStatus: (listener: (s: unknown) => void) => subscribeSyncStatusMock(listener),
});

export const syncStatusMock = (original: typeof import('@/app/syncStatus')) => ({
  ...original,
  isSyncConfigured: () => true,
});

export const FIXTURE_SKILLS: SkillType[] = [
  {
    typeID: 1,
    name: 'Gunnery',
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
  {
    typeID: 2,
    name: 'Small Hybrid Turret',
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [{ skillTypeID: 1, level: 3 }],
  },
  {
    typeID: 3,
    name: 'Spaceship Command',
    description: '',
    groupID: 20,
    groupName: 'Spaceship Command',
    rank: 1,
    primaryAttr: 'intelligence',
    secondaryAttr: 'memory',
    prereqs: [],
  },
  {
    typeID: 4,
    name: 'Small Projectile Turret',
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
];

export const RIFTER_TYPE_ID = 587;
const FIXTURE_TYPES = {
  [RIFTER_TYPE_ID]: { name: 'Rifter', groupID: 25, volume: 27_000 },
};

export const loadSdeMock = () => ({
  loadSkills: vi.fn(async () => FIXTURE_SKILLS),
  loadTypes: vi.fn(async () => FIXTURE_TYPES),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
});
