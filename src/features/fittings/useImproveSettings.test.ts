import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  useImproveJob,
  useImproveJobByRole,
  useImproveRigs,
  useImproveSpace,
  useImproveSpaceByRole,
} from './useImprove';

const fresh = async () => {
  await db.settings.clear();
  useImproveJob.setState({ value: 'pve', hydrated: false });
  useImproveSpace.setState({ value: 'dangerous', hydrated: false });
  useImproveRigs.setState({ value: true, hydrated: false });
};
beforeEach(fresh);

describe('Improve Job and space', () => {
  it('start on PvE and Dangerous', async () => {
    await useImproveJob.getState().hydrate();
    await useImproveSpace.getState().hydrate();
    expect(useImproveJob.getState().value).toBe('pve');
    expect(useImproveSpace.getState().value).toBe('dangerous');
  });

  it('are remembered on this device, in their own rows', async () => {
    await useImproveJob.getState().setValue('explore');
    await useImproveSpace.getState().setValue('safe');
    expect((await db.settings.get('fittingsImproveJob'))?.value).toBe('explore');
    expect((await db.settings.get('fittingsImproveSpace'))?.value).toBe('safe');
    // a reload: the stores start from nothing and read the rows back
    useImproveJob.setState({ value: 'pve', hydrated: false });
    useImproveSpace.setState({ value: 'dangerous', hydrated: false });
    await useImproveJob.getState().hydrate();
    await useImproveSpace.getState().hydrate();
    expect(useImproveJob.getState().value).toBe('explore');
    expect(useImproveSpace.getState().value).toBe('safe');
  });

  it('fall back to the defaults for a stored value that is not one', async () => {
    await db.settings.bulkPut([
      { key: 'fittingsImproveJob', value: 'tackle' },
      { key: 'fittingsImproveSpace', value: 3 },
    ]);
    await useImproveJob.getState().hydrate();
    await useImproveSpace.getState().hydrate();
    expect(useImproveJob.getState().value).toBe('pve');
    expect(useImproveSpace.getState().value).toBe('dangerous');
  });
});

describe('Improve rigs', () => {
  it('are on for a pilot who never touched the tick', async () => {
    await useImproveRigs.getState().hydrate();
    expect(useImproveRigs.getState().value).toBe(true);
    expect(await db.settings.get('fittingsImproveRigs')).toBeUndefined();
  });

  it('stay off once the pilot has unticked them', async () => {
    await useImproveRigs.getState().setValue(false);
    useImproveRigs.setState({ value: true, hydrated: false });
    await useImproveRigs.getState().hydrate();
    expect(useImproveRigs.getState().value).toBe(false);
  });

  it('ignore a stored value that is not a boolean', async () => {
    await db.settings.put({ key: 'fittingsImproveRigs', value: 'off' });
    await useImproveRigs.getState().hydrate();
    expect(useImproveRigs.getState().value).toBe(true);
  });
});

describe('Improve Job and space per hull role', () => {
  it('are kept per role, in their own rows, and come back after a reload', async () => {
    await useImproveJobByRole.getState().setValue({ combat: 'pvp', explorer: 'pve' });
    await useImproveSpaceByRole.getState().setValue({ explorer: 'safe' });
    expect((await db.settings.get('fittingsImproveJobByRole'))?.value).toEqual({
      combat: 'pvp',
      explorer: 'pve',
    });
    useImproveJobByRole.setState({ value: {}, hydrated: false });
    useImproveSpaceByRole.setState({ value: {}, hydrated: false });
    await useImproveJobByRole.getState().hydrate();
    await useImproveSpaceByRole.getState().hydrate();
    expect(useImproveJobByRole.getState().value).toEqual({ combat: 'pvp', explorer: 'pve' });
    expect(useImproveSpaceByRole.getState().value).toEqual({ explorer: 'safe' });
  });

  it('drop unknown roles and values from a stored row', async () => {
    await db.settings.put({
      key: 'fittingsImproveJobByRole',
      value: { combat: 'tackle', explorer: 'explore', pirate: 'pvp' },
    });
    useImproveJobByRole.setState({ value: {}, hydrated: false });
    await useImproveJobByRole.getState().hydrate();
    expect(useImproveJobByRole.getState().value).toEqual({ explorer: 'explore' });
  });
});
