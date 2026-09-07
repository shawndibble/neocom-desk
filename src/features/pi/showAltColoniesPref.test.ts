import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  useShowAltColonies,
  PI_COLONIES_SHOW_ALTS_KEY,
  DEFAULT_PI_COLONIES_SHOW_ALTS,
} from './showAltColoniesPref';
import { useAltColonies, PI_ALT_COLONIES_KEY, DEFAULT_PI_ALT_COLONIES } from './altColoniesPref';

beforeEach(async () => {
  await db.settings.clear();
  useShowAltColonies.setState({ value: DEFAULT_PI_COLONIES_SHOW_ALTS, hydrated: false });
  useAltColonies.setState({ value: DEFAULT_PI_ALT_COLONIES, hydrated: false });
});

describe('useShowAltColonies', () => {
  it('is off by default, unhydrated — the Colonies list before this was persisted', () => {
    expect(useShowAltColonies.getState().value).toBe(false);
    expect(useShowAltColonies.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under the piColoniesShowAlts key', async () => {
    await useShowAltColonies.getState().setValue(true);
    expect((await db.settings.get(PI_COLONIES_SHOW_ALTS_KEY))?.value).toBe(true);
  });

  it('applies a persisted choice on hydrate', async () => {
    await db.settings.put({ key: PI_COLONIES_SHOW_ALTS_KEY, value: true });
    await useShowAltColonies.getState().hydrate();
    expect(useShowAltColonies.getState().value).toBe(true);
  });

  it('falls back to off when the stored value is not a boolean', async () => {
    await db.settings.put({ key: PI_COLONIES_SHOW_ALTS_KEY, value: 'yes' });
    await useShowAltColonies.getState().hydrate();
    expect(useShowAltColonies.getState().value).toBe(false);
  });

  /**
   * *Show me* is not *plan with*: widening the Colonies list to see where an
   * alt's colonies sit must not widen what the Advisor assumes it may route
   * between. Two keys is the whole mechanism, so it gets a test.
   */
  it('does not move the Advisor’s own alt-colonies setting', async () => {
    await useShowAltColonies.getState().setValue(true);
    await useAltColonies.getState().hydrate();

    expect(useAltColonies.getState().value).toBe(false);
    expect(await db.settings.get(PI_ALT_COLONIES_KEY)).toBeUndefined();
  });

  it('is not moved by the Advisor’s setting either', async () => {
    await useAltColonies.getState().setValue(true);
    await useShowAltColonies.getState().hydrate();

    expect(useShowAltColonies.getState().value).toBe(false);
  });
});
