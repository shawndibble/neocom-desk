import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import type { HullRole } from '@/engine/fittings/improve';
import type { SettingStore } from '@/lib/settingStore';
import { holdHydration } from '@/test/holdHydration';
import { IMPROVE_STORES, useImproveSettings } from './useImproveSettings';

type AnyStore = SettingStore<unknown>;
const stores = Object.entries(IMPROVE_STORES) as [string, AnyStore][];
const defaults = new Map(stores.map(([field, store]) => [field, store.getState().value]));

beforeEach(async () => {
  await db.settings.clear();
  for (const [field, store] of stores)
    store.setState({ value: defaults.get(field), hydrated: false });
});

const renderSettings = (role: HullRole = 'combat') =>
  renderHook((props: { role: HullRole }) => useImproveSettings(props.role), {
    initialProps: { role },
  });

const loaded = async (role: HullRole = 'combat') => {
  const hook = renderSettings(role);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
};

describe('useImproveSettings', () => {
  it('reads the remembered Improve settings back after a reload', async () => {
    await db.settings.bulkPut([
      { key: 'fittingsImproveJob', value: 'pvp' },
      { key: 'fittingsImproveSpace', value: 'safe' },
      { key: 'fittingsImproveRigs', value: false },
      { key: 'fittingsImproveReach', value: 'rework' },
      { key: 'fittingsImproveSort', value: 'value' },
    ]);
    const { result } = await loaded();
    expect(result.current.value).toMatchObject({
      job: 'pvp',
      space: 'safe',
      includeRigs: false,
      reach: 'rework',
      sort: 'value',
    });
  });

  it('starts on the defaults when nothing is stored', async () => {
    const { result } = await loaded();
    expect(result.current.value).toEqual({
      goal: 'overall',
      sort: 'gain',
      job: 'pve',
      space: 'dangerous',
      noPropulsion: false,
      reach: 'upgrade',
      iskBudget: null,
      includeRigs: true,
      oreFamily: 'Simple Asteroid',
      hold: 'cargo',
    });
  });

  it('reads the PvE no-propulsion opt-out back after a reload, off by default', async () => {
    await db.settings.put({ key: 'fittingsImproveNoPropulsion', value: true });
    const { result } = await loaded();
    expect(result.current.value.noPropulsion).toBe(true);
  });

  it('reads the goal, Job and space remembered per hull role back for the role asked', async () => {
    await db.settings.bulkPut([
      { key: 'fittingsImproveGoalByRole', value: { combat: 'damage' } },
      { key: 'fittingsImproveJobByRole', value: { combat: 'pvp', explorer: 'explore' } },
      { key: 'fittingsImproveSpaceByRole', value: { explorer: 'safe' } },
    ]);
    const { result, rerender } = await loaded('explorer');
    expect(result.current.value).toMatchObject({ goal: 'explore', job: 'explore', space: 'safe' });
    rerender({ role: 'combat' });
    expect(result.current.value).toMatchObject({ goal: 'damage', job: 'pvp', space: 'dangerous' });
  });

  it('remembers a per-role change for that role alone, and switching role keeps both', async () => {
    const { result, rerender } = await loaded('combat');
    await act(() => result.current.set({ job: 'pvp', goal: 'damage' }));
    expect(result.current.value).toMatchObject({ job: 'pvp', goal: 'damage' });
    rerender({ role: 'mining' });
    expect(result.current.value).toMatchObject({ job: 'pve', goal: 'mining' });
    await act(() => result.current.set({ goal: 'cheaper' }));
    rerender({ role: 'combat' });
    expect(result.current.value).toMatchObject({ job: 'pvp', goal: 'damage' });
    expect((await db.settings.get('fittingsImproveJobByRole'))?.value).toEqual({ combat: 'pvp' });
    expect((await db.settings.get('fittingsImproveGoalByRole'))?.value).toEqual({
      combat: 'damage',
      mining: 'cheaper',
    });
  });

  it('remembers a setting kept for every hull in its own row', async () => {
    const { result, rerender } = await loaded('combat');
    await act(() => result.current.set({ sort: 'value', iskBudget: 50_000_000 }));
    expect((await db.settings.get('fittingsImproveSort'))?.value).toBe('value');
    expect((await db.settings.get('fittingsImproveBudget'))?.value).toBe(50_000_000);
    rerender({ role: 'hauling' });
    expect(result.current.value).toMatchObject({ sort: 'value', iskBudget: 50_000_000 });
  });

  it('is not ready until every remembered store is read', async () => {
    for (const [field, store] of stores) {
      const held = holdHydration(store, defaults.get(field));
      const { result, unmount } = renderSettings();
      await waitFor(() =>
        expect(stores.every(([other, s]) => other === field || s.getState().hydrated)).toBe(true)
      );
      expect(result.current.ready, field).toBe(false);
      act(() => held.release());
      await waitFor(() => expect(result.current.ready, field).toBe(true));
      held.restore();
      unmount();
    }
  });
});
