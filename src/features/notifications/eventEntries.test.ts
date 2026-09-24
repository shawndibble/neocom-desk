/**
 * The Event Entry catalog (issue #1285): one entry per Notification Event
 * declaring its diff, copy, projectability and thresholds. These tests drive
 * one event at a time through its own entry — snapshot pair in, rendered copy
 * out — with no poll harness, no fetch and no Dexie.
 */
import { describe, expect, it } from 'vitest';
import { PROJECTABLE_EVENT_IDS } from '@/engine/projection';
import { NOTIFICATION_EVENT_IDS, type NotificationEventId } from './events';
import { THRESHOLD_KEYS } from './eventThresholds';
import { NOTIFICATION_EVENT_ENTRIES, eventEntry } from './eventEntries';

const C = 1;
const PILOT = 'Kestrel';
const T0 = Date.UTC(2026, 8, 22, 12);
const DAY_MS = 86_400_000;

describe('NOTIFICATION_EVENT_ENTRIES', () => {
  it('has exactly one entry per catalog event, in catalog order', () => {
    expect(Object.keys(NOTIFICATION_EVENT_ENTRIES)).toEqual(NOTIFICATION_EVENT_IDS);
  });

  it('declares a projection for exactly the projectable events', () => {
    const projecting = NOTIFICATION_EVENT_IDS.filter(
      (id) => eventEntry(id).projection !== null
    ).sort();
    expect(projecting).toEqual([...PROJECTABLE_EVENT_IDS].sort());
  });

  it('marks only eveNotification as projecting some occurrences, not every one', () => {
    const partial = NOTIFICATION_EVENT_IDS.filter((id) => {
      const projection = eventEntry(id).projection;
      return projection !== null && !projection.everyOccurrence;
    });
    expect(partial).toEqual(['eveNotification']);
  });

  it('gives every threshold field to exactly one event', () => {
    const owners = new Map<string, NotificationEventId[]>();
    for (const id of NOTIFICATION_EVENT_IDS) {
      for (const field of eventEntry(id).thresholds?.fields ?? []) {
        owners.set(field.key, [...(owners.get(field.key) ?? []), id]);
      }
    }
    expect(Object.fromEntries(owners)).toEqual({
      extractorExpiringLeadHours: ['planetaryExtractorExpiring'],
      skillQueueEndingLeadHours: ['skillQueueEnding'],
      walletBalanceChangedThresholdIsk: ['walletBalanceChanged'],
      structureFuelLowDays: ['structureFuelLow'],
      corpWalletBalanceFloorIsk: ['corpWalletThreshold'],
      corpWalletTransactionCeilingIsk: ['corpWalletThreshold'],
    });
    expect([...owners.keys()].sort()).toEqual([...THRESHOLD_KEYS].sort());
  });

  it('carries a row hint only where Settings shows one regardless of grants', () => {
    const hinted = NOTIFICATION_EVENT_IDS.filter((id) => eventEntry(id).rowHintKey !== null);
    expect(hinted).toEqual(['planetaryExtractorExpiring']);
  });
});

describe('one event through its entry', () => {
  it('newMail: a mail id above the previous high fires and reads as new mail', () => {
    const entry = NOTIFICATION_EVENT_ENTRIES.newMail;
    const fires = entry.diff(
      C,
      { entries: [{ mailId: 10 }], nowMs: T0 },
      { entries: [{ mailId: 10 }, { mailId: 11 }], nowMs: T0 }
    );
    expect(fires).toEqual([{ eventId: 'newMail', characterId: C, mailId: 11 }]);
    expect(entry.copy.poll(fires[0], PILOT, {})).toEqual({
      title: 'New mail',
      body: 'Kestrel has new mail.',
    });
    expect(entry.projection).toBeNull();
    expect(entry.thresholds).toBeNull();
  });

  it('contractAccepted: routes to the contract row', () => {
    const entry = NOTIFICATION_EVENT_ENTRIES.contractAccepted;
    const contract = { contractId: 7, issuerId: C, acceptorId: 2 };
    const fires = entry.diff(
      C,
      { entries: [{ ...contract, status: 'outstanding' }], nowMs: T0 },
      { entries: [{ ...contract, status: 'in_progress' }], nowMs: T0 }
    );
    expect(fires).toEqual([{ eventId: 'contractAccepted', characterId: C, contractId: 7 }]);
    expect(entry.copy.subjectOf?.(fires[0])).toBe(7);
    expect(entry.copy.poll(fires[0], PILOT, {}).title).toBe('Contract accepted');
  });

  it('corpMemberLeft: names the member, routes nowhere', () => {
    const entry = NOTIFICATION_EVENT_ENTRIES.corpMemberLeft;
    const fires = entry.diff(
      C,
      { entries: [{ characterId: 5 }, { characterId: 6 }], nowMs: T0 },
      { entries: [{ characterId: 5 }], nowMs: T0 }
    );
    expect(fires).toEqual([{ eventId: 'corpMemberLeft', characterId: C, memberCharacterId: 6 }]);
    expect(entry.copy.poll(fires[0], PILOT, { member: 'Rook' }).body).toBe(
      'Kestrel: Rook left the corporation.'
    );
    expect(entry.copy.subjectOf?.(fires[0])).toBeUndefined();
  });

  it('structureFuelLow: fires on crossing its threshold, pushes hedged, owns the day threshold', () => {
    const entry = NOTIFICATION_EVENT_ENTRIES.structureFuelLow;
    const structure = { structureId: 9, name: 'Keepstar', thresholdMs: 7 * DAY_MS };
    const fuelExpiresMs = T0 + 6 * DAY_MS;
    const fires = entry.diff(
      C,
      { entries: [{ ...structure, fuelExpiresMs }], nowMs: T0 - 2 * DAY_MS },
      { entries: [{ ...structure, fuelExpiresMs }], nowMs: T0 }
    );
    expect(fires).toHaveLength(1);
    expect(entry.copy.poll(fires[0], PILOT, {}).body).toBe(
      'Kestrel: Keepstar has less than 7 days of fuel remaining.'
    );
    expect(entry.projection.push(fires[0], PILOT, {}).body).toBe(
      'Kestrel: Keepstar was due to run out of fuel.'
    );
    expect(entry.thresholds.fields.map((field) => field.key)).toEqual(['structureFuelLowDays']);
  });

  it('skillQueueEnding: fires as the tail crosses its lead time, pushes hedged, owns its own lead-hours threshold', () => {
    const entry = NOTIFICATION_EVENT_ENTRIES.skillQueueEnding;
    const LEAD = 6 * 3_600_000;
    const tailEntry = {
      skillId: 3300,
      finishedLevel: 4,
      queuePosition: 0,
      endingLeadMs: LEAD,
    };
    const finishMs = T0 + LEAD + 5 * 60_000;
    const fires = entry.diff(
      C,
      { entries: [{ ...tailEntry, finishMs }], nowMs: T0 },
      { entries: [{ ...tailEntry, finishMs }], nowMs: T0 + 5 * 60_000 }
    );
    expect(fires).toHaveLength(1);
    expect(entry.copy.poll(fires[0], PILOT, {}).body).toBe(
      "Kestrel's skill queue will run dry in under 6 hours."
    );
    expect(entry.projection.push(fires[0], PILOT, {}).body).toBe(
      "Kestrel's skill queue was due to run dry in under 6 hours."
    );
    expect(entry.thresholds.fields.map((field) => field.key)).toEqual([
      'skillQueueEndingLeadHours',
    ]);
  });
});
