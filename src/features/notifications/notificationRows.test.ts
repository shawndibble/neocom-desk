import { describe, it, expect } from 'vitest';
import type { NotificationEventId } from './events';
import {
  estimateCharacterSectionHeight,
  isCorpEventId,
  type CharacterSectionHeightInput,
} from './notificationRows';

const ORDINARY = 'newMail' satisfies NotificationEventId;
const EXTRACTOR = 'planetaryExtractorExpiring' satisfies NotificationEventId;
const FUEL = 'structureFuelLow' satisfies NotificationEventId;
const WALLET_BALANCE = 'walletBalanceChanged' satisfies NotificationEventId;
const CORP_WALLET = 'corpWalletThreshold' satisfies NotificationEventId;
const CORP_MEMBER = 'corpMemberJoined' satisfies NotificationEventId;
const EVE_NOTIFICATION = 'eveNotification' satisfies NotificationEventId;

function input(overrides: Partial<CharacterSectionHeightInput> = {}): CharacterSectionHeightInput {
  return {
    expanded: false,
    visibleEventIds: [],
    rowEnabledFor: () => true,
    hasEveNotificationScope: false,
    ...overrides,
  };
}

describe('isCorpEventId', () => {
  it('is true for exactly the five corp events (issue #299)', () => {
    for (const id of [
      'structureFuelLow',
      'corpIndustryJobReady',
      'corpMemberJoined',
      'corpMemberLeft',
      'corpWalletThreshold',
    ] as const) {
      expect(isCorpEventId(id)).toBe(true);
    }
    expect(isCorpEventId(ORDINARY)).toBe(false);
  });
});

describe('estimateCharacterSectionHeight', () => {
  it('a collapsed Character is just the header, regardless of how many events it has', () => {
    const collapsed = estimateCharacterSectionHeight(input({ expanded: false }));
    const withEvents = estimateCharacterSectionHeight(
      input({ expanded: false, visibleEventIds: [ORDINARY, EXTRACTOR] })
    );
    expect(collapsed).toBe(withEvents);
    expect(collapsed).toBeGreaterThan(0);
  });

  it('grows with each visible event once expanded', () => {
    const one = estimateCharacterSectionHeight(
      input({ expanded: true, visibleEventIds: [ORDINARY] })
    );
    const two = estimateCharacterSectionHeight(
      input({ expanded: true, visibleEventIds: [ORDINARY, 'industryJobComplete'] })
    );
    expect(two).toBeGreaterThan(one);
  });

  it('adds the extractor hint regardless of rowEnabled', () => {
    const base = estimateCharacterSectionHeight(input({ expanded: true, visibleEventIds: [] }));
    const withHint = estimateCharacterSectionHeight(
      input({ expanded: true, visibleEventIds: [EXTRACTOR], rowEnabledFor: () => false })
    );
    // event row + hint row, both added regardless of rowEnabled
    expect(withHint).toBeGreaterThan(base);
  });

  it('adds the fuel threshold only when the row is enabled', () => {
    const enabled = estimateCharacterSectionHeight(
      input({ expanded: true, visibleEventIds: [FUEL], rowEnabledFor: () => true })
    );
    const disabled = estimateCharacterSectionHeight(
      input({ expanded: true, visibleEventIds: [FUEL], rowEnabledFor: () => false })
    );
    expect(enabled).toBeGreaterThan(disabled);
  });

  it('adds the wallet-balance and corp-wallet thresholds only when enabled', () => {
    const enabled = estimateCharacterSectionHeight(
      input({
        expanded: true,
        visibleEventIds: [WALLET_BALANCE, CORP_WALLET],
        rowEnabledFor: () => true,
      })
    );
    const disabled = estimateCharacterSectionHeight(
      input({
        expanded: true,
        visibleEventIds: [WALLET_BALANCE, CORP_WALLET],
        rowEnabledFor: () => false,
      })
    );
    expect(enabled).toBeGreaterThan(disabled);
  });

  it('adds the corp best-effort hint for a corp event regardless of rowEnabled', () => {
    const base = estimateCharacterSectionHeight(input({ expanded: true, visibleEventIds: [] }));
    const withCorpEvent = estimateCharacterSectionHeight(
      input({ expanded: true, visibleEventIds: [CORP_MEMBER], rowEnabledFor: () => false })
    );
    expect(withCorpEvent).toBeGreaterThan(base);
  });

  it('adds a large block for eve-type family/type rows only when hasEveNotificationScope', () => {
    const withScope = estimateCharacterSectionHeight(
      input({ expanded: true, visibleEventIds: [EVE_NOTIFICATION], hasEveNotificationScope: true })
    );
    const withoutScope = estimateCharacterSectionHeight(
      input({ expanded: true, visibleEventIds: [EVE_NOTIFICATION], hasEveNotificationScope: false })
    );
    // Dozens of allow-listed types across several families dwarf one event row.
    expect(withScope).toBeGreaterThan(withoutScope + 500);
  });
});
