import { describe, it, expect } from 'vitest';
import { ESI_REGISTRY } from '@/esi/registry';
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_IDS } from './events';
import { isEventEnabledFor, isEveTypeEnabledFor } from './eventSelection';

describe('NOTIFICATION_EVENTS', () => {
  it('lists exactly the 10 synthesized events from CONTEXT.md round 20, plus eveNotification (issue #274), planetaryExtractorExpiring (issue #310) and the five corp events (issue #299), in order', () => {
    expect(NOTIFICATION_EVENT_IDS).toEqual([
      'skillLevelComplete',
      'characterNotTraining',
      'industryJobComplete',
      'newMail',
      'planetaryExtractionDone',
      'planetaryExtractorExpiring',
      'marketOrderFilled',
      'newCalendarEvent',
      'calendarEventStarting',
      'contractAccepted',
      'walletBalanceChanged',
      'eveNotification',
      'structureFuelLow',
      'corpIndustryJobReady',
      'corpMemberJoined',
      'corpMemberLeft',
      'corpWalletThreshold',
    ]);
  });

  it('has no duplicate ids', () => {
    expect(new Set(NOTIFICATION_EVENT_IDS).size).toBe(NOTIFICATION_EVENT_IDS.length);
  });

  it("derives each event's scope from ESI_REGISTRY rather than a hand-copied string", () => {
    const skillQueueScope = ESI_REGISTRY.getCharacterSkillQueue.scope;
    const skillEvents = NOTIFICATION_EVENTS.filter(
      (e) => e.id === 'skillLevelComplete' || e.id === 'characterNotTraining'
    );
    expect(skillEvents).toHaveLength(2);
    for (const event of skillEvents) expect(event.scope).toBe(skillQueueScope);

    const walletEvent = NOTIFICATION_EVENTS.find((e) => e.id === 'walletBalanceChanged');
    expect(walletEvent?.scope).toBe(ESI_REGISTRY.getCharacterWallet.scope);
  });

  it('gives every event a distinct settings.notifications.event.* label key', () => {
    const keys = NOTIFICATION_EVENTS.map((e) => e.labelKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('settings.notifications.event.')).toBe(true);
  });

  it('gives every corp event (issue #299) a corpCapability and no personal event one', () => {
    const CORP_EVENT_IDS = [
      'structureFuelLow',
      'corpIndustryJobReady',
      'corpMemberJoined',
      'corpMemberLeft',
      'corpWalletThreshold',
    ];
    for (const event of NOTIFICATION_EVENTS) {
      if (CORP_EVENT_IDS.includes(event.id)) {
        expect(event.corpCapability, event.id).toBeDefined();
      } else {
        expect(event.corpCapability, event.id).toBeUndefined();
      }
    }
  });

  it("derives each corp event's scope from ESI_REGISTRY rather than a hand-copied string", () => {
    expect(NOTIFICATION_EVENTS.find((e) => e.id === 'structureFuelLow')?.scope).toBe(
      ESI_REGISTRY.getCorporationStructures.scope
    );
    expect(NOTIFICATION_EVENTS.find((e) => e.id === 'corpIndustryJobReady')?.scope).toBe(
      ESI_REGISTRY.getCorporationIndustryJobs.scope
    );
    expect(NOTIFICATION_EVENTS.find((e) => e.id === 'corpMemberJoined')?.scope).toBe(
      ESI_REGISTRY.getCorporationMembers.scope
    );
    expect(NOTIFICATION_EVENTS.find((e) => e.id === 'corpMemberLeft')?.scope).toBe(
      ESI_REGISTRY.getCorporationMembers.scope
    );
    expect(NOTIFICATION_EVENTS.find((e) => e.id === 'corpWalletThreshold')?.scope).toBe(
      ESI_REGISTRY.getCorporationWallets.scope
    );
  });

  /**
   * The issue's explicit ask: "Both channels on by default is right here,
   * but express it deliberately... so the contrast with the EVE-type default
   * is intentional and documented" (issue #299). This is that contrast, made
   * executable rather than only prose in a comment: every corp event reads
   * both-on from a character with no stored preference at all, on the same
   * "absence means enabled" path every other ordinary event uses
   * (`eventSelection.ts`) — never `eveNotification`'s per-type
   * feed-on/browser-off default, which numerous, mostly-informational types
   * need and these five rare, high-stakes ones do not.
   */
  it('defaults both channels on for a corp event with no stored preference, unlike an EVE type', () => {
    const corpEventIds = NOTIFICATION_EVENTS.filter((e) => e.corpCapability !== undefined).map(
      (e) => e.id
    );
    expect(corpEventIds).toEqual([
      'structureFuelLow',
      'corpIndustryJobReady',
      'corpMemberJoined',
      'corpMemberLeft',
      'corpWalletThreshold',
    ]);
    for (const eventId of corpEventIds) {
      expect(isEventEnabledFor({}, eventId, 'browser'), eventId).toBe(true);
      expect(isEventEnabledFor({}, eventId, 'feed'), eventId).toBe(true);
    }
    // The contrast: an EVE-native type with no stored preference defaults to
    // feed-on/browser-off, not both-on.
    expect(isEveTypeEnabledFor({}, 'BillOutOfMoneyMsg', 'browser')).toBe(false);
    expect(isEveTypeEnabledFor({}, 'BillOutOfMoneyMsg', 'feed')).toBe(true);
  });
});
