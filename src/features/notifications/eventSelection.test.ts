import { describe, it, expect } from 'vitest';
import type { NotificationEventId } from './events';
import {
  isEventEnabledFor,
  selectionStateForEvents,
  toggleEventChannel,
  toggleAllEventsOnChannel,
  isEveTypeAllowed,
  isEveTypeEnabledFor,
  toggleEveTypeChannel,
  EVE_ALLOWED_TYPES,
  NOTIFICATION_FAMILIES,
  eveTypesByFamily,
  selectionStateForEveTypes,
  toggleAllEveTypesOnChannel,
  type EventEnabledMap,
  type EveTypeEnabledMap,
} from './eventSelection';

const A = 'skillLevelComplete' satisfies NotificationEventId;
const B = 'newMail' satisfies NotificationEventId;

describe('isEventEnabledFor', () => {
  it('defaults an absent event to on for both channels', () => {
    expect(isEventEnabledFor({}, A, 'browser')).toBe(true);
    expect(isEventEnabledFor({}, A, 'feed')).toBe(true);
  });

  it('reads a legacy bare boolean as applying to both channels', () => {
    const legacy: EventEnabledMap = { [A]: false };
    expect(isEventEnabledFor(legacy, A, 'browser')).toBe(false);
    expect(isEventEnabledFor(legacy, A, 'feed')).toBe(false);
  });

  it('reads channels independently', () => {
    const map: EventEnabledMap = { [A]: { browser: false } };
    expect(isEventEnabledFor(map, A, 'browser')).toBe(false);
    expect(isEventEnabledFor(map, A, 'feed')).toBe(true);
  });
});

describe('selectionStateForEvents', () => {
  it('is per column', () => {
    const map: EventEnabledMap = { [A]: { browser: false }, [B]: { browser: false } };
    expect(selectionStateForEvents([A, B], map, 'browser')).toBe('unchecked');
    expect(selectionStateForEvents([A, B], map, 'feed')).toBe('checked');
  });

  it('is indeterminate on a partial column', () => {
    const map: EventEnabledMap = { [A]: { browser: false } };
    expect(selectionStateForEvents([A, B], map, 'browser')).toBe('indeterminate');
  });
});

describe('toggleEventChannel', () => {
  it('flips one channel and leaves the other alone', () => {
    const next = toggleEventChannel({}, A, 'browser');
    expect(isEventEnabledFor(next, A, 'browser')).toBe(false);
    expect(isEventEnabledFor(next, A, 'feed')).toBe(true);
  });

  it('materialises a legacy boolean without changing the untouched channel', () => {
    const next = toggleEventChannel({ [A]: false }, A, 'feed');
    expect(isEventEnabledFor(next, A, 'feed')).toBe(true);
    expect(isEventEnabledFor(next, A, 'browser')).toBe(false);
  });

  it('does not disturb other events', () => {
    const next = toggleEventChannel({ [B]: { feed: false } }, A, 'browser');
    expect(isEventEnabledFor(next, B, 'feed')).toBe(false);
  });
});

describe('toggleAllEventsOnChannel', () => {
  it('clears a fully-enabled column, keeping the other column intact', () => {
    const next = toggleAllEventsOnChannel([A, B], {}, 'browser');
    expect(isEventEnabledFor(next, A, 'browser')).toBe(false);
    expect(isEventEnabledFor(next, B, 'browser')).toBe(false);
    expect(isEventEnabledFor(next, A, 'feed')).toBe(true);
    expect(isEventEnabledFor(next, B, 'feed')).toBe(true);
  });

  it('fills in a partial column rather than clearing it', () => {
    const map: EventEnabledMap = { [A]: { browser: false } };
    const next = toggleAllEventsOnChannel([A, B], map, 'browser');
    expect(isEventEnabledFor(next, A, 'browser')).toBe(true);
    expect(isEventEnabledFor(next, B, 'browser')).toBe(true);
  });
});

const TYPE_A = 'BillOutOfMoneyMsg';
const TYPE_B = 'AllWarDeclaredMsg';

describe('EVE_ALLOWED_TYPES / isEveTypeAllowed', () => {
  it('holds exactly the 17 types with hand-written bodies', () => {
    expect(EVE_ALLOWED_TYPES).toHaveLength(17);
    expect(new Set(EVE_ALLOWED_TYPES).size).toBe(17);
  });

  it('allows every type on the list', () => {
    for (const type of EVE_ALLOWED_TYPES) {
      expect(isEveTypeAllowed(type)).toBe(true);
    }
  });

  it('rejects a type outside the list', () => {
    expect(isEveTypeAllowed('SomeBrandNewMsgType6041')).toBe(false);
  });
});

describe('isEveTypeEnabledFor', () => {
  it('defaults an absent type to feed-on, browser-off — the opposite of isEventEnabledFor', () => {
    expect(isEveTypeEnabledFor({}, TYPE_A, 'browser')).toBe(false);
    expect(isEveTypeEnabledFor({}, TYPE_A, 'feed')).toBe(true);
  });

  it('reads channels independently once set', () => {
    const map: EveTypeEnabledMap = { [TYPE_A]: { browser: true } };
    expect(isEveTypeEnabledFor(map, TYPE_A, 'browser')).toBe(true);
    // feed still falls back to the default, not to the browser value.
    expect(isEveTypeEnabledFor(map, TYPE_A, 'feed')).toBe(true);
  });

  it('never falls back to another type', () => {
    const map: EveTypeEnabledMap = { [TYPE_A]: { feed: false } };
    expect(isEveTypeEnabledFor(map, TYPE_B, 'feed')).toBe(true);
  });

  it('defaults the three structure-attack types to browser-on as well as feed-on', () => {
    for (const type of ['StructureUnderAttack', 'StructureLostShields', 'StructureLostArmor']) {
      expect(isEveTypeEnabledFor({}, type, 'browser')).toBe(true);
      expect(isEveTypeEnabledFor({}, type, 'feed')).toBe(true);
    }
  });

  it('lets an explicit preference win over a structure-attack type browser-on default', () => {
    const map: EveTypeEnabledMap = { StructureUnderAttack: { browser: false } };
    expect(isEveTypeEnabledFor(map, 'StructureUnderAttack', 'browser')).toBe(false);
  });
});

describe('toggleEveTypeChannel', () => {
  it('flips one channel off its default and leaves the other at its default', () => {
    const next = toggleEveTypeChannel({}, TYPE_A, 'browser');
    expect(isEveTypeEnabledFor(next, TYPE_A, 'browser')).toBe(true);
    expect(isEveTypeEnabledFor(next, TYPE_A, 'feed')).toBe(true);
  });

  it('can opt a type out of the feed while leaving browser at its default', () => {
    const next = toggleEveTypeChannel({}, TYPE_A, 'feed');
    expect(isEveTypeEnabledFor(next, TYPE_A, 'feed')).toBe(false);
    expect(isEveTypeEnabledFor(next, TYPE_A, 'browser')).toBe(false);
  });

  it('does not disturb other types', () => {
    const next = toggleEveTypeChannel({ [TYPE_B]: { feed: false } }, TYPE_A, 'browser');
    expect(isEveTypeEnabledFor(next, TYPE_B, 'feed')).toBe(false);
  });
});

describe('NOTIFICATION_FAMILIES / eveTypesByFamily', () => {
  it('holds the six families named in CONTEXT.md round 44', () => {
    expect(NOTIFICATION_FAMILIES).toEqual([
      'structures',
      'war',
      'corpGovernance',
      'bills',
      'moonMining',
      'pi',
    ]);
  });

  it('assigns every allow-listed type to exactly one family', () => {
    const grouped = NOTIFICATION_FAMILIES.flatMap((family) => eveTypesByFamily(family));
    expect([...grouped].sort()).toEqual([...EVE_ALLOWED_TYPES].sort());
  });

  it('lets a family with no allow-listed types yet come back empty', () => {
    expect(eveTypesByFamily('pi')).toEqual([]);
  });

  it('groups the structures family correctly', () => {
    expect(eveTypesByFamily('structures')).toEqual(
      expect.arrayContaining(['StructureUnderAttack', 'StructureFuelAlert'])
    );
  });
});

describe('selectionStateForEveTypes', () => {
  it('defaults an unset column to its per-channel default: checked for feed, unchecked for browser', () => {
    expect(selectionStateForEveTypes([TYPE_A, TYPE_B], {}, 'feed')).toBe('checked');
    expect(selectionStateForEveTypes([TYPE_A, TYPE_B], {}, 'browser')).toBe('unchecked');
  });

  it('is indeterminate on a partial column', () => {
    const map: EveTypeEnabledMap = { [TYPE_A]: { browser: true } };
    expect(selectionStateForEveTypes([TYPE_A, TYPE_B], map, 'browser')).toBe('indeterminate');
  });

  it('reports unchecked for an empty list', () => {
    expect(selectionStateForEveTypes([], {}, 'browser')).toBe('unchecked');
  });

  it('is indeterminate on the real structures family, which mixes browser-on and browser-off defaults', () => {
    const structures = eveTypesByFamily('structures');
    expect(selectionStateForEveTypes(structures, {}, 'browser')).toBe('indeterminate');
    expect(selectionStateForEveTypes(structures, {}, 'feed')).toBe('checked');
  });
});

describe('toggleAllEveTypesOnChannel', () => {
  it('clears a fully-enabled column, keeping the other column intact', () => {
    const next = toggleAllEveTypesOnChannel([TYPE_A, TYPE_B], {}, 'feed');
    expect(isEveTypeEnabledFor(next, TYPE_A, 'feed')).toBe(false);
    expect(isEveTypeEnabledFor(next, TYPE_B, 'feed')).toBe(false);
    expect(isEveTypeEnabledFor(next, TYPE_A, 'browser')).toBe(false);
    expect(isEveTypeEnabledFor(next, TYPE_B, 'browser')).toBe(false);
  });

  it('fills in a partial column rather than clearing it', () => {
    const map: EveTypeEnabledMap = { [TYPE_A]: { browser: true } };
    const next = toggleAllEveTypesOnChannel([TYPE_A, TYPE_B], map, 'browser');
    expect(isEveTypeEnabledFor(next, TYPE_A, 'browser')).toBe(true);
    expect(isEveTypeEnabledFor(next, TYPE_B, 'browser')).toBe(true);
  });
});
