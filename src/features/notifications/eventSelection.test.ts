import { describe, it, expect } from 'vitest';
import type { NotificationEventId } from './events';
import {
  isEventEnabledFor,
  toggleEventChannel,
  isEveTypeAllowed,
  isEveTypeEnabledFor,
  enabledEveTypesForBrowser,
  extraEveTypes,
  toggleEveTypeChannel,
  EVE_ALLOWED_TYPES,
  NOTIFICATION_FAMILIES,
  eveTypesByFamily,
  broadcastEventChannelFlags,
  selectionStateForAllCharactersEveTypes,
  broadcastEveTypeChannelFlags,
  broadcastAllEveTypesChannelFlags,
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

describe('isEventEnabledFor — feed-only defaults', () => {
  it('defaults marketOrderFilled, walletBalanceChanged, contractCompleted and contractFailed to feed-on, browser-off — unlike the default-both-on rule above', () => {
    for (const eventId of [
      'marketOrderFilled',
      'walletBalanceChanged',
      'contractCompleted',
      'contractFailed',
    ] as const) {
      expect(isEventEnabledFor({}, eventId, 'browser')).toBe(false);
      expect(isEventEnabledFor({}, eventId, 'feed')).toBe(true);
    }
  });

  it('lets an explicit preference win over the feed-only default', () => {
    const map: EventEnabledMap = { marketOrderFilled: { browser: true } };
    expect(isEventEnabledFor(map, 'marketOrderFilled', 'browser')).toBe(true);
    expect(isEventEnabledFor(map, 'marketOrderFilled', 'feed')).toBe(true);
  });

  it('reads a legacy bare boolean for a feed-only event as applying to both channels regardless of the new default', () => {
    const legacy: EventEnabledMap = { walletBalanceChanged: true };
    expect(isEventEnabledFor(legacy, 'walletBalanceChanged', 'browser')).toBe(true);
    expect(isEventEnabledFor(legacy, 'walletBalanceChanged', 'feed')).toBe(true);
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

describe('broadcastEventChannelFlags (issue #738)', () => {
  it('turns every known Character on when at least one disagrees or is off', () => {
    const perCharacter = { 1: { [A]: { browser: false } }, 2: {} };
    const next = broadcastEventChannelFlags([1, 2], A, perCharacter, 'browser');
    expect(isEventEnabledFor(next[1], A, 'browser')).toBe(true);
    expect(isEventEnabledFor(next[2], A, 'browser')).toBe(true);
  });

  it('turns every known Character off only when all already agree on', () => {
    const perCharacter = { 1: {}, 2: {} };
    const next = broadcastEventChannelFlags([1, 2], A, perCharacter, 'browser');
    expect(isEventEnabledFor(next[1], A, 'browser')).toBe(false);
    expect(isEventEnabledFor(next[2], A, 'browser')).toBe(false);
  });

  it('leaves the other channel and other events untouched', () => {
    const perCharacter = { 1: { [A]: { feed: false }, [B]: { browser: false } } };
    const next = broadcastEventChannelFlags([1], A, perCharacter, 'browser');
    expect(isEventEnabledFor(next[1], A, 'feed')).toBe(false);
    expect(isEventEnabledFor(next[1], B, 'browser')).toBe(false);
  });
});

const TYPE_A = 'BillOutOfMoneyMsg';
const TYPE_B = 'AllWarDeclaredMsg';

describe('EVE_ALLOWED_TYPES / isEveTypeAllowed', () => {
  it('holds exactly the 29 types with hand-written bodies', () => {
    expect(EVE_ALLOWED_TYPES).toHaveLength(29);
    expect(new Set(EVE_ALLOWED_TYPES).size).toBe(29);
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

  it('defaults the four tranche-2 browser-on types to browser-on as well as feed-on', () => {
    for (const type of [
      'StructureDestroyed',
      'OrbitalAttacked',
      'OrbitalReinforced',
      'CorpKicked',
    ]) {
      expect(isEveTypeEnabledFor({}, type, 'browser')).toBe(true);
      expect(isEveTypeEnabledFor({}, type, 'feed')).toBe(true);
    }
  });

  it('defaults the rest of tranche 2 to feed-on, browser-off', () => {
    for (const type of [
      'StructuresJobsPaused',
      'StructuresJobsCancelled',
      'StructureLowReagentsAlert',
      'StructureNoReagentsAlert',
      'InfrastructureHubBillAboutToExpire',
    ]) {
      expect(isEveTypeEnabledFor({}, type, 'browser')).toBe(false);
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
  it('holds the six families named in GLOSSARY.md round 44', () => {
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

  // Issue #4058: the whole drill cycle, so a corp moon Extraction
  // timeline is exact (epic #4055, D14).
  it('groups the moonMining family: the whole drill cycle', () => {
    expect([...eveTypesByFamily('moonMining')].sort()).toEqual([
      'MoonminingAutomaticFracture',
      'MoonminingExtractionCancelled',
      'MoonminingExtractionFinished',
      'MoonminingExtractionStarted',
      'MoonminingLaserFired',
    ]);
  });

  it('groups the pi family (customs-office types only)', () => {
    expect(eveTypesByFamily('pi')).toEqual(['OrbitalAttacked', 'OrbitalReinforced']);
  });

  it('groups the structures family correctly', () => {
    expect(eveTypesByFamily('structures')).toEqual(
      expect.arrayContaining(['StructureUnderAttack', 'StructureFuelAlert'])
    );
  });
});

describe('selectionStateForAllCharactersEveTypes (issue #745)', () => {
  it('is checked only when every Character agrees every type is on', () => {
    const perCharacter = { 1: {}, 2: {} };
    expect(
      selectionStateForAllCharactersEveTypes([1, 2], [TYPE_A, TYPE_B], perCharacter, 'feed')
    ).toBe('checked');
  });

  it('is indeterminate when one Character disagrees on one type', () => {
    const perCharacter = { 1: { [TYPE_A]: { feed: false } }, 2: {} };
    expect(
      selectionStateForAllCharactersEveTypes([1, 2], [TYPE_A, TYPE_B], perCharacter, 'feed')
    ).toBe('indeterminate');
  });

  it('is unchecked with no Characters or no types', () => {
    expect(selectionStateForAllCharactersEveTypes([], [TYPE_A, TYPE_B], {}, 'feed')).toBe(
      'unchecked'
    );
    expect(selectionStateForAllCharactersEveTypes([1], [], {}, 'feed')).toBe('unchecked');
  });
});

describe('broadcastEveTypeChannelFlags (issue #745)', () => {
  it('turns every known Character on when at least one disagrees or is off', () => {
    const perCharacter = { 1: { [TYPE_A]: { feed: false } }, 2: {} };
    const next = broadcastEveTypeChannelFlags([1, 2], TYPE_A, perCharacter, 'feed');
    expect(isEveTypeEnabledFor(next[1], TYPE_A, 'feed')).toBe(true);
    expect(isEveTypeEnabledFor(next[2], TYPE_A, 'feed')).toBe(true);
  });

  it('turns every known Character off only when all already agree on', () => {
    const perCharacter = { 1: { [TYPE_A]: { feed: true } }, 2: { [TYPE_A]: { feed: true } } };
    const next = broadcastEveTypeChannelFlags([1, 2], TYPE_A, perCharacter, 'feed');
    expect(isEveTypeEnabledFor(next[1], TYPE_A, 'feed')).toBe(false);
    expect(isEveTypeEnabledFor(next[2], TYPE_A, 'feed')).toBe(false);
  });

  it('leaves the other channel and other types untouched', () => {
    const perCharacter = { 1: { [TYPE_A]: { browser: true }, [TYPE_B]: { feed: false } } };
    const next = broadcastEveTypeChannelFlags([1], TYPE_A, perCharacter, 'feed');
    expect(isEveTypeEnabledFor(next[1], TYPE_A, 'browser')).toBe(true);
    expect(isEveTypeEnabledFor(next[1], TYPE_B, 'feed')).toBe(false);
  });
});

describe('broadcastAllEveTypesChannelFlags (issue #745)', () => {
  it('turns every Character and type on when the whole grid is not already fully on', () => {
    const perCharacter = { 1: { [TYPE_A]: { feed: false } }, 2: {} };
    const next = broadcastAllEveTypesChannelFlags([1, 2], [TYPE_A, TYPE_B], perCharacter, 'feed');
    expect(isEveTypeEnabledFor(next[1], TYPE_A, 'feed')).toBe(true);
    expect(isEveTypeEnabledFor(next[1], TYPE_B, 'feed')).toBe(true);
    expect(isEveTypeEnabledFor(next[2], TYPE_A, 'feed')).toBe(true);
    expect(isEveTypeEnabledFor(next[2], TYPE_B, 'feed')).toBe(true);
  });

  it('clears the whole grid only when it was already fully on', () => {
    const perCharacter = {
      1: { [TYPE_A]: { feed: true }, [TYPE_B]: { feed: true } },
      2: { [TYPE_A]: { feed: true }, [TYPE_B]: { feed: true } },
    };
    const next = broadcastAllEveTypesChannelFlags([1, 2], [TYPE_A, TYPE_B], perCharacter, 'feed');
    expect(isEveTypeEnabledFor(next[1], TYPE_A, 'feed')).toBe(false);
    expect(isEveTypeEnabledFor(next[2], TYPE_B, 'feed')).toBe(false);
  });
});

describe('enabledEveTypesForBrowser', () => {
  it('applies the per-type browser default to types the map does not mention', () => {
    expect(enabledEveTypesForBrowser({}, ['StructureDestroyed', 'CorpAppNewMsg'])).toEqual([
      'StructureDestroyed',
    ]);
  });

  it('lets an explicit flag win over the default in either direction', () => {
    const map: EveTypeEnabledMap = {
      StructureDestroyed: { browser: false },
      CorpAppNewMsg: { browser: true },
    };
    expect(enabledEveTypesForBrowser(map, ['StructureDestroyed', 'CorpAppNewMsg'])).toEqual([
      'CorpAppNewMsg',
    ]);
  });

  it('ignores the feed flag', () => {
    expect(
      enabledEveTypesForBrowser({ StructureDestroyed: { feed: false } }, ['StructureDestroyed'])
    ).toEqual(['StructureDestroyed']);
  });

  it('returns a sorted, de-duplicated list', () => {
    const map: EveTypeEnabledMap = { B: { browser: true }, A: { browser: true } };
    expect(enabledEveTypesForBrowser(map, ['B', 'A', 'B'])).toEqual(['A', 'B']);
  });

  it('does not offer a type outside the known list even when the map enables it', () => {
    expect(enabledEveTypesForBrowser({ Mystery: { browser: true } }, ['A'])).toEqual([]);
  });
});

describe('extraEveTypes', () => {
  it('keeps only seen types that are not on the allow-list, sorted and de-duplicated', () => {
    expect(extraEveTypes([EVE_ALLOWED_TYPES[0], 'ZNew', 'ANew', 'ZNew'])).toEqual(['ANew', 'ZNew']);
  });
});
