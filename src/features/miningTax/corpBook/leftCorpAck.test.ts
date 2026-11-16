import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { hideLeftCorp, readHiddenLeftCorps, showLeftCorp } from './leftCorpAck';

describe('leftCorpAck', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('starts empty', async () => {
    expect((await readHiddenLeftCorps()).size).toBe(0);
  });

  it('holds hidden corporations and releases them again', async () => {
    await hideLeftCorp(20);
    await hideLeftCorp(30);
    await hideLeftCorp(20);
    expect([...(await readHiddenLeftCorps())].sort()).toEqual([20, 30]);
    await showLeftCorp(20);
    expect([...(await readHiddenLeftCorps())]).toEqual([30]);
  });

  it('ignores a value another build wrote badly', async () => {
    await db.settings.put({ key: 'corpLeftHidden', value: [20, 'x', -1, 1.5] });
    expect([...(await readHiddenLeftCorps())]).toEqual([20]);
    await db.settings.put({ key: 'corpLeftHidden', value: 'nope' });
    expect((await readHiddenLeftCorps()).size).toBe(0);
  });
});
