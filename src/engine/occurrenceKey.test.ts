import { describe, it, expect } from 'vitest';
import { occurrenceKey } from './occurrenceKey';
import type {
  NotificationFire,
  IndustryJobNotificationFire,
  PlanetaryNotificationFire,
  MailNotificationFire,
  NewCalendarEventFire,
  CalendarEventStartingFire,
  ExtractorExpiringFire,
  ContractNotificationFire,
  WalletNotificationFire,
  MarketOrderNotificationFire,
  EveNotificationFire,
  StructureFuelLowFire,
  CorpIndustryJobNotificationFire,
  CorpMemberJoinedFire,
  CorpMemberLeftFire,
  CorpWalletThresholdFire,
  StructureReinforcementExitFire,
} from './notificationDiffs';

const T0 = 1_700_000_000_000;

describe('occurrenceKey', () => {
  it('derives the same key for two identical skillLevelComplete fires', () => {
    const fire: NotificationFire = {
      eventId: 'skillLevelComplete',
      characterId: 7,
      skillId: 3300,
      level: 4,
      finishMs: T0,
    };
    expect(occurrenceKey(fire, T0)).toEqual(occurrenceKey({ ...fire }, T0 + 60_000));
  });

  it('gives skillLevelComplete a different key for a different finish time', () => {
    const base: NotificationFire = {
      eventId: 'skillLevelComplete',
      characterId: 7,
      skillId: 3300,
      level: 4,
      finishMs: T0,
    };
    expect(occurrenceKey(base, T0)).not.toEqual(occurrenceKey({ ...base, finishMs: T0 + 1 }, T0));
  });

  it('buckets characterNotTraining by day, agreeing within the same day and disagreeing across days', () => {
    const fire: NotificationFire = {
      eventId: 'characterNotTraining',
      characterId: 7,
      skillId: null,
      level: null,
      finishMs: null,
    };
    expect(occurrenceKey(fire, T0)).toEqual(occurrenceKey(fire, T0 + 60_000));
    expect(occurrenceKey(fire, T0)).not.toEqual(occurrenceKey(fire, T0 + 86_400_000));
  });

  it('keys industryJobComplete and corpIndustryJobReady on jobId, and keeps the two events distinct', () => {
    const personal: IndustryJobNotificationFire = {
      eventId: 'industryJobComplete',
      characterId: 7,
      jobId: 55,
      blueprintTypeId: 1,
      productTypeId: 2,
      activityId: 1,
    };
    const corp: CorpIndustryJobNotificationFire = {
      eventId: 'corpIndustryJobReady',
      characterId: 7,
      jobId: 55,
      blueprintTypeId: 1,
      productTypeId: 2,
      activityId: 1,
    };
    expect(occurrenceKey(personal, T0)).toEqual(occurrenceKey({ ...personal }, T0 + 1000));
    expect(occurrenceKey(personal, T0)).not.toEqual(occurrenceKey(corp, T0));
  });

  it('keys planetaryExtractionDone on planetId and the colony expiry', () => {
    const fire: PlanetaryNotificationFire = {
      eventId: 'planetaryExtractionDone',
      characterId: 7,
      planetId: 40000001,
      expiryTimeMs: T0,
    };
    expect(occurrenceKey(fire, T0)).toEqual(occurrenceKey({ ...fire }, T0 + 1000));
    expect(occurrenceKey(fire, T0)).not.toEqual(
      occurrenceKey({ ...fire, expiryTimeMs: T0 + 1 }, T0)
    );
  });

  it('keys planetaryExtractorExpiring on pinId, expiry and threshold together', () => {
    const fire: ExtractorExpiringFire = {
      eventId: 'planetaryExtractorExpiring',
      characterId: 7,
      planetId: 40000001,
      pinId: 42,
      thresholdMs: 24 * 3_600_000,
      expiryTimeMs: T0,
    };
    expect(occurrenceKey(fire, T0)).toEqual(occurrenceKey({ ...fire }, T0));
    // The 12h and 24h warnings for the same program are distinct occurrences.
    expect(occurrenceKey(fire, T0)).not.toEqual(
      occurrenceKey({ ...fire, thresholdMs: 12 * 3_600_000 }, T0)
    );
  });

  it('keys newCalendarEvent and calendarEventStarting on calendarEventId, and keeps the two events distinct', () => {
    const newEvent: NewCalendarEventFire = {
      eventId: 'newCalendarEvent',
      characterId: 7,
      calendarEventId: 99,
    };
    const starting: CalendarEventStartingFire = {
      eventId: 'calendarEventStarting',
      characterId: 7,
      calendarEventId: 99,
    };
    expect(occurrenceKey(newEvent, T0)).not.toEqual(occurrenceKey(starting, T0));
  });

  it('keys contractAccepted on contractId', () => {
    const fire: ContractNotificationFire = {
      eventId: 'contractAccepted',
      characterId: 7,
      contractId: 123,
    };
    expect(occurrenceKey(fire, T0)).toEqual(occurrenceKey({ ...fire }, T0 + 1000));
  });

  it('keys marketOrderFilled on orderId', () => {
    const fire: MarketOrderNotificationFire = {
      eventId: 'marketOrderFilled',
      characterId: 7,
      orderId: 456,
    };
    expect(occurrenceKey(fire, T0)).toEqual(occurrenceKey({ ...fire }, T0 + 1000));
  });

  it('keys newMail on mailId', () => {
    const fire: MailNotificationFire = { eventId: 'newMail', characterId: 7, mailId: 789 };
    expect(occurrenceKey(fire, T0)).toEqual(occurrenceKey({ ...fire }, T0 + 1000));
  });

  it("keys eveNotification on ESI's notificationId", () => {
    const fire: EveNotificationFire = {
      eventId: 'eveNotification',
      characterId: 7,
      notificationId: 321,
      type: 'AllWarDeclaredMsg',
      senderId: 1,
      senderType: 'corporation',
      text: 't',
      timestamp: '2024-01-01T00:00:00Z',
    };
    expect(occurrenceKey(fire, T0)).toEqual(occurrenceKey({ ...fire }, T0 + 1000));
  });

  it('keys structureReinforcementExit on the same notificationId distinctly from the live eveNotification fire (issue #359: a Feed upsert must not overwrite the shields/armor-lost row with the exit row)', () => {
    const notificationId = 321;
    const live: EveNotificationFire = {
      eventId: 'eveNotification',
      characterId: 7,
      notificationId,
      type: 'StructureLostShields',
      senderId: 1,
      senderType: 'corporation',
      text: 't',
      timestamp: '2024-01-01T00:00:00Z',
    };
    const projectedExit: StructureReinforcementExitFire = {
      eventId: 'structureReinforcementExit',
      characterId: 7,
      notificationId,
    };
    expect(occurrenceKey(projectedExit, T0)).not.toEqual(occurrenceKey(live, T0));
  });

  it('keys structureFuelLow on structureId and the fuel countdown it belongs to', () => {
    const fire: StructureFuelLowFire = {
      eventId: 'structureFuelLow',
      characterId: 7,
      structureId: 111,
      structureName: 'Keepstar',
      thresholdMs: 86_400_000,
      fuelExpiresMs: T0 + 86_400_000,
    };
    expect(occurrenceKey(fire, T0)).toEqual(occurrenceKey({ ...fire }, T0 + 1000));
    // A refuel starts a new countdown — a genuinely distinct occurrence, not
    // a re-observation of the same one.
    expect(occurrenceKey(fire, T0)).not.toEqual(
      occurrenceKey({ ...fire, fuelExpiresMs: fire.fuelExpiresMs + 1 }, T0)
    );
  });

  it('keys corpMemberJoined and corpMemberLeft on memberCharacterId, and keeps the two events distinct', () => {
    const joined: CorpMemberJoinedFire = {
      eventId: 'corpMemberJoined',
      characterId: 7,
      memberCharacterId: 88,
    };
    const left: CorpMemberLeftFire = {
      eventId: 'corpMemberLeft',
      characterId: 7,
      memberCharacterId: 88,
    };
    expect(occurrenceKey(joined, T0)).not.toEqual(occurrenceKey(left, T0));
  });

  it('buckets walletBalanceChanged by day', () => {
    const fire: WalletNotificationFire = {
      eventId: 'walletBalanceChanged',
      characterId: 7,
      amount: 1000,
    };
    expect(occurrenceKey(fire, T0)).toEqual(occurrenceKey(fire, T0 + 60_000));
    expect(occurrenceKey(fire, T0)).not.toEqual(occurrenceKey(fire, T0 + 86_400_000));
  });

  it('buckets corpWalletThreshold balanceBelow by day and division, a genuine threshold crossing', () => {
    const balanceBelow: CorpWalletThresholdFire = {
      eventId: 'corpWalletThreshold',
      characterId: 7,
      kind: 'balanceBelow',
      division: 1,
      balance: 100,
      thresholdIsk: 1000,
    };
    expect(occurrenceKey(balanceBelow, T0)).toEqual(occurrenceKey(balanceBelow, T0 + 60_000));
    expect(occurrenceKey(balanceBelow, T0)).not.toEqual(
      occurrenceKey({ ...balanceBelow, division: 2 }, T0)
    );
  });

  it('keys corpWalletThreshold transactionAbove on the journal entry id the diff already high-water-marks by', () => {
    const transactionAbove: CorpWalletThresholdFire = {
      eventId: 'corpWalletThreshold',
      characterId: 7,
      kind: 'transactionAbove',
      division: 1,
      amount: 5_000_000,
      thresholdIsk: 1_000_000,
      journalEntryId: 42,
    };
    // Same real time, different entries — two distinct occurrences, not one.
    expect(occurrenceKey(transactionAbove, T0)).not.toEqual(
      occurrenceKey({ ...transactionAbove, journalEntryId: 43 }, T0)
    );
    // Same entry, different poll time — the same occurrence.
    expect(occurrenceKey(transactionAbove, T0)).toEqual(
      occurrenceKey({ ...transactionAbove }, T0 + 60_000)
    );
    const balanceBelow: CorpWalletThresholdFire = {
      eventId: 'corpWalletThreshold',
      characterId: 7,
      kind: 'balanceBelow',
      division: 1,
      balance: 100,
      thresholdIsk: 1000,
    };
    expect(occurrenceKey(balanceBelow, T0)).not.toEqual(occurrenceKey(transactionAbove, T0));
  });

  it('namespaces every key by characterId, so two characters never collide', () => {
    const fire: MailNotificationFire = { eventId: 'newMail', characterId: 7, mailId: 789 };
    expect(occurrenceKey(fire, T0)).not.toEqual(occurrenceKey({ ...fire, characterId: 8 }, T0));
  });
});
