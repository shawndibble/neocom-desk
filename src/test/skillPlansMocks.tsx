import { vi } from 'vitest';
import type { SkillType } from '@/sde/types';
import { IDLE_SYNC_STATUS } from '@/sync/statusFixtures';

// Shared mock factories and fixtures for the SkillPlans route tests
// (SkillPlans*.test.tsx). Kept free of app runtime imports: a `vi.mock` factory
// imports this module while the app graph is still loading.

export const pwaRegisterMock = () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
});

// Real src/sync would attempt actual Firebase network calls (this repo's
// .env carries a real dev project config). markPlanDeleted is faked down to
// its local-delete effect only — the tombstone/remote bookkeeping is src/sync's
// own responsibility and is covered by its own test suite.
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

// isSyncConfigured reads import.meta.env, which is 'test' MODE in this suite
// and would otherwise disable the scheduleSync-after-edit wiring under test.
// Force it on so that wiring is exercised (against the mocked src/sync above,
// never real Firebase).
export const syncStatusMock = (original: typeof import('@/app/syncStatus')) => ({
  ...original,
  isSyncConfigured: () => true,
});

// Small hand-made fixture, not the real SDE: a prereq chain (Small Hybrid
// Turret needs Gunnery III) plus a second attribute pair (Spaceship Command)
// and a same-pair-as-Gunnery skill (Small Projectile Turret) to exercise
// prereq insertion, remap segmentation, and reorder-by-attribute-pair.
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
export const FIXTURE_TYPES = {
  [RIFTER_TYPE_ID]: { name: 'Rifter', groupID: 25, volume: 27_000 },
};

export const loadSdeMock = () => ({
  loadSkills: vi.fn(async () => FIXTURE_SKILLS),
  loadTypes: vi.fn(async () => FIXTURE_TYPES),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
});
