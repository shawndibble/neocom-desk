import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { useImproveJob, useImproveRigs, useImproveSpace } from './useImprove';

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
