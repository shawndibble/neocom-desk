import { describe, it, expect } from 'vitest';
import type { NotificationEventId } from './events';
import {
  estimateCharacterSectionHeight,
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
    missingPermissionFor: () => false,
    hasEveNotificationScope: false,
    touchViewport: false,
    ...overrides,
  };
}

describe('estimateCharacterSectionHeight', () => {
  it('a touch viewport estimates the taller touch-tier header (issue #1118)', () => {
    // The header button carries `min-h-11 md:min-h-0`, so the same section is
    // 12px taller on a phone. The virtualizer has no `measureElement` to
    // correct that later: an estimate stuck at the pointer height would stack
    // every section 12px too high and overlap them down a long roster.
    const pointer = estimateCharacterSectionHeight(input({ touchViewport: false }));
    const touch = estimateCharacterSectionHeight(input({ touchViewport: true }));
    expect(touch - pointer).toBe(12);
  });

  it('the touch-tier header is added once per section, not once per row', () => {
    const expandedPointer = estimateCharacterSectionHeight(
      input({ expanded: true, visibleEventIds: [ORDINARY, FUEL], touchViewport: false })
    );
    const expandedTouch = estimateCharacterSectionHeight(
      input({ expanded: true, visibleEventIds: [ORDINARY, FUEL], touchViewport: true })
    );
    expect(expandedTouch - expandedPointer).toBe(12);
  });

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

  it('adds the Needs-permission line, taller on touch where its Grant button is (issue #1525)', () => {
    const at = (touchViewport: boolean, missing: boolean) =>
      estimateCharacterSectionHeight(
        input({
          expanded: true,
          visibleEventIds: [ORDINARY],
          rowEnabledFor: () => !missing,
          missingPermissionFor: () => missing,
          touchViewport,
        })
      );
    // py-1.5 + 1px border around a `size="sm"` Button: h-7 at md, h-9 below.
    expect(at(false, true) - at(false, false)).toBe(41);
    expect(at(true, true) - at(true, false)).toBe(49);
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
