import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import type { Fitting } from '@/engine/fittings/types';
import {
  clearFittingDraft,
  parseFittingDraft,
  readFittingDraft,
  writeFittingDraft,
} from './fittingDraft';

const fitting: Fitting = {
  name: 'Huge',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 1, state: 'active' }],
  drones: [],
  cargo: [{ typeId: 34, quantity: 5 }],
};

beforeEach(async () => {
  await db.settings.clear();
});

describe('parseFittingDraft', () => {
  it('accepts a stored Fitting', () => {
    expect(parseFittingDraft(fitting)).toEqual(fitting);
  });

  it.each([
    null,
    undefined,
    'x',
    3,
    {},
    { ...fitting, shipTypeId: 'a' },
    { ...fitting, modules: 1 },
  ])('rejects %j', (value) => {
    expect(parseFittingDraft(value)).toBeNull();
  });
});

describe('Fitting draft store', () => {
  it('reads nothing before a write', async () => {
    expect(await readFittingDraft()).toBeNull();
  });

  it('round-trips a written draft, the latest write winning', async () => {
    await writeFittingDraft(fitting);
    await writeFittingDraft({ ...fitting, name: 'Huger' });
    expect((await readFittingDraft())?.name).toBe('Huger');
  });

  it('clears the draft', async () => {
    await writeFittingDraft(fitting);
    await clearFittingDraft();
    expect(await readFittingDraft()).toBeNull();
  });

  it('reads a corrupt row as no draft', async () => {
    await db.settings.put({ key: 'fittingDraft', value: { nope: true } });
    expect(await readFittingDraft()).toBeNull();
  });
});
