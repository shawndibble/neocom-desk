import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  DEFAULT_PI_SETTINGS,
  migrateLegacyPiSettings,
  parsePiSettings,
  usePiSettings,
} from './piSettings';

describe('migrateLegacyPiSettings', () => {
  it('maps a stored hub to that hub with P1 buying on', () => {
    expect(migrateLegacyPiSettings('amarr', { priceHub: 'jita' })).toEqual({
      hub: 'amarr',
      buybackPct: null,
      buyTiers: [1],
      hubChosen: true,
    });
  });

  it('maps none to no buying, keeping the Goal Planner price hub', () => {
    expect(migrateLegacyPiSettings('none', { priceHub: 'rens', maxP0Types: 1 })).toEqual({
      hub: 'rens',
      buybackPct: null,
      buyTiers: [],
      hubChosen: true,
    });
  });

  it('treats the pre-hub boolean and junk as no buying at the default hub', () => {
    expect(migrateLegacyPiSettings(true, undefined)).toEqual(DEFAULT_PI_SETTINGS);
    expect(migrateLegacyPiSettings('nowhere', { priceHub: 'nowhere' })).toEqual(
      DEFAULT_PI_SETTINGS
    );
  });
});

describe('parsePiSettings', () => {
  it('keeps a whole value and orders and filters the tiers', () => {
    expect(parsePiSettings({ hub: 'hek', buybackPct: 90, buyTiers: [3, 1, 4, 'x'] })).toEqual({
      hub: 'hek',
      buybackPct: 90,
      buyTiers: [1, 3],
      hubChosen: true,
    });
  });

  it('leaves a default-hub row unchosen, so the strip may suggest a nearer hub', () => {
    expect(
      parsePiSettings({ hub: 'jita', buybackPct: null, buyTiers: [] })?.hubChosen
    ).toBeUndefined();
    expect(parsePiSettings({ hub: 'jita', hubChosen: true })?.hubChosen).toBe(true);
  });

  it('keeps the haul-between-planets opt-in only when it is on, and never counts it as a hub pick', () => {
    expect(parsePiSettings({ hub: 'jita', haulBetweenPlanets: true })).toEqual({
      ...DEFAULT_PI_SETTINGS,
      haulBetweenPlanets: true,
    });
    expect(parsePiSettings({ hub: 'jita', haulBetweenPlanets: 'yes' })).toEqual(
      DEFAULT_PI_SETTINGS
    );
    expect(parsePiSettings({ hub: 'jita', haulBetweenPlanets: false })).toEqual(
      DEFAULT_PI_SETTINGS
    );
    expect(DEFAULT_PI_SETTINGS.haulBetweenPlanets).toBeUndefined();
  });

  it('repairs each bad field and refuses a non-object', () => {
    expect(parsePiSettings({ hub: 'x', buybackPct: 'a', buyTiers: 'b' })).toEqual(
      DEFAULT_PI_SETTINGS
    );
    expect(parsePiSettings('x')).toBeNull();
  });
});

describe('usePiSettings', () => {
  beforeEach(async () => {
    await db.settings.clear();
    usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: false });
  });

  it('hydrates from the legacy keys when no row is stored, and keeps what is set after', async () => {
    await db.settings.put({ key: 'piMarketSourcing', value: 'dodixie' });
    await usePiSettings.getState().hydrate();
    expect(usePiSettings.getState().value).toEqual({
      hub: 'dodixie',
      buybackPct: null,
      buyTiers: [1],
      hubChosen: true,
    });
    await usePiSettings.getState().setValue({ ...usePiSettings.getState().value, buyTiers: [2] });
    expect((await db.settings.get('piSettings'))?.value).toMatchObject({ buyTiers: [2] });
  });

  it('defaults when nothing is stored', async () => {
    await usePiSettings.getState().hydrate();
    expect(usePiSettings.getState().value).toEqual(DEFAULT_PI_SETTINGS);
  });
});
