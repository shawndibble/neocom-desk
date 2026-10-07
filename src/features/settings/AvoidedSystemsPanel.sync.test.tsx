import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import { IDLE_SYNC_STATUS } from '@/sync/statusFixtures';
import { AVOIDED_SYSTEMS_KEY, useAvoidedSystems } from '@/features/route/avoidedSystems';
import { AvoidedSystemsPanel } from './AvoidedSystemsPanel';

/*
 * An add or remove is pushed as it happens — stamped for merging and a sync
 * scheduled for every Character on the device — not left for the next sync
 * something else happens to trigger.
 */

const SYSTEMS: SolarSystemEntry[] = [
  { id: 30002813, name: 'Tama', security: 0.3, regionId: 10000069 },
  { id: 30045328, name: 'Uedama', security: 0.5, regionId: 10000033 },
];

const setSyncedSetting = vi.fn<(key: string, value: unknown) => Promise<void>>();
const scheduleSync = vi.fn<(characterId: number) => void>();

vi.mock('@/app/syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/syncStatus')>()),
  // The real one is false under `MODE === 'test'`, which skips the push entirely.
  isSyncConfigured: () => true,
}));

vi.mock('@/sync', () => ({
  getSyncStatus: () => IDLE_SYNC_STATUS,
  setSyncedSetting: (key: string, value: unknown) => setSyncedSetting(key, value),
  scheduleSync: (characterId: number) => scheduleSync(characterId),
}));

vi.mock('@/sde/loadMarketSde', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/sde/loadMarketSde')>();
  return { ...actual, loadSolarSystems: async () => SYSTEMS };
});

beforeEach(async () => {
  await db.settings.clear();
  await db.characters.clear();
  await db.characters.bulkPut([
    { characterId: 1001, name: 'Main' },
    { characterId: 1002, name: 'Alt' },
  ] as never);
  useAvoidedSystems.setState({ value: [], hydrated: false });
  setSyncedSetting.mockReset().mockResolvedValue(undefined);
  scheduleSync.mockReset();
});

describe('AvoidedSystemsPanel sync', () => {
  it('pushes an added system and schedules a sync for every Character', async () => {
    const user = userEvent.setup();
    render(<AvoidedSystemsPanel />);

    await user.click(await screen.findByRole('button', { name: 'Add an avoided system' }));
    await user.type(screen.getByRole('combobox'), 'ued');
    await user.click(await screen.findByRole('option', { name: /Uedama/ }));

    await waitFor(() => expect(scheduleSync).toHaveBeenCalledTimes(2));
    expect(setSyncedSetting).toHaveBeenCalledWith(AVOIDED_SYSTEMS_KEY, [30045328]);
    expect(scheduleSync.mock.calls.map(([id]) => id).sort()).toEqual([1001, 1002]);
  });

  it('pushes a removal the same way', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_KEY, value: [30045328, 30002813] });
    const user = userEvent.setup();
    render(<AvoidedSystemsPanel />);

    await user.click(await screen.findByRole('button', { name: 'Remove Uedama' }));

    await waitFor(() => expect(scheduleSync).toHaveBeenCalledTimes(2));
    expect(setSyncedSetting).toHaveBeenCalledWith(AVOIDED_SYSTEMS_KEY, [30002813]);
  });
});
