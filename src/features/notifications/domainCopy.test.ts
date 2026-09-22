/**
 * Per-domain copy tables (issue #1249): fire + resolved names → rendered
 * `{ title, body }`, for the live (poll) path and the Scheduled Push path, with
 * no poll harness and no lookups. Every expected string here was captured
 * from the renderers these replaced (`foregroundPoller.ts`'s
 * `notificationText`, `engine/projection.ts`'s `*Text` helpers) before the
 * move — the refactor changed no rendered copy.
 */
import { describe, it, expect } from 'vitest';
import type { NotificationCopy } from '@/engine/notificationWording';
import {
  skillQueueCopy,
  spExtractionCopy,
  industryJobCopy,
  colonyCopy,
  mailCopy,
  calendarCopy,
  contractCopy,
  walletCopy,
  marketOrderCopy,
  eveNotificationCopy,
  structureFuelCopy,
  corpIndustryJobCopy,
  corpRosterCopy,
  corpWalletCopy,
  priceAlertCopy,
} from './domainCopy';

const C = 1;
const PILOT = 'Kestrel';
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

interface Case {
  name: string;
  render: () => NotificationCopy;
  expected: NotificationCopy;
}

function table(cases: Case[]) {
  it.each(cases)('$name', ({ render, expected }) => {
    expect(render()).toEqual(expected);
  });
}

const skill = (skillId: number | null, level: number | null) =>
  ({ eventId: 'skillLevelComplete', characterId: C, skillId, level, finishMs: 1 }) as const;
const notTraining = {
  eventId: 'characterNotTraining',
  characterId: C,
  skillId: null,
  level: null,
  finishMs: null,
} as const;
const job = (blueprintTypeId: number, productTypeId: number | null) =>
  ({
    eventId: 'industryJobComplete',
    characterId: C,
    jobId: 5,
    blueprintTypeId,
    productTypeId,
    activityId: 1,
  }) as const;
const corpJob = (blueprintTypeId: number, productTypeId: number | null) =>
  ({ ...job(blueprintTypeId, productTypeId), eventId: 'corpIndustryJobReady' }) as const;
const extractionDone = (planetId: number) =>
  ({ eventId: 'planetaryExtractionDone', characterId: C, planetId, expiryTimeMs: 1 }) as const;
const extractorExpiring = (planetId: number, thresholdMs: number) =>
  ({
    eventId: 'planetaryExtractorExpiring',
    characterId: C,
    planetId,
    pinId: 1,
    thresholdMs,
    expiryTimeMs: 1,
  }) as const;
const fuelLow = {
  eventId: 'structureFuelLow',
  characterId: C,
  structureId: 1,
  structureName: 'Keepstar',
  thresholdMs: 3 * DAY_MS,
  fuelExpiresMs: 1,
} as const;

describe('poll copy', () => {
  table([
    {
      name: 'skillLevelComplete, named',
      render: () => skillQueueCopy.poll(skill(3300, 3), PILOT, { skill: 'Gunnery' }),
      expected: {
        title: 'Skill training complete',
        body: 'Kestrel finished training Gunnery III.',
      },
    },
    {
      name: 'skillLevelComplete, unresolved name and out-of-range level',
      render: () => skillQueueCopy.poll(skill(1, 0), PILOT, {}),
      expected: { title: 'Skill training complete', body: 'Kestrel finished training #1 .' },
    },
    {
      name: 'skillLevelComplete, no skill id',
      render: () => skillQueueCopy.poll(skill(null, 6), PILOT, {}),
      expected: { title: 'Skill training complete', body: 'Kestrel finished training #null .' },
    },
    {
      name: 'characterNotTraining',
      render: () => skillQueueCopy.poll(notTraining, PILOT, {}),
      expected: { title: 'Not training', body: 'Kestrel has no skill in training.' },
    },
    {
      name: 'spExtractionReady',
      render: () =>
        spExtractionCopy.poll({ eventId: 'spExtractionReady', characterId: C }, PILOT, {}),
      expected: {
        title: 'SP extraction ready',
        body: 'Kestrel has enough spare skill points to use a Skill Extractor.',
      },
    },
    {
      name: 'industryJobComplete, product',
      render: () => industryJobCopy.poll(job(691, 587), PILOT, { item: 'Rifter' }),
      expected: {
        title: 'Industry job complete',
        body: "Kestrel's industry job for Rifter is complete.",
      },
    },
    {
      name: 'industryJobComplete, unresolved falls back to the product id',
      render: () => industryJobCopy.poll(job(2, 99), PILOT, {}),
      expected: {
        title: 'Industry job complete',
        body: "Kestrel's industry job for #99 is complete.",
      },
    },
    {
      name: 'industryJobComplete, no product falls back to the blueprint id',
      render: () => industryJobCopy.poll(job(691, null), PILOT, {}),
      expected: {
        title: 'Industry job complete',
        body: "Kestrel's industry job for #691 is complete.",
      },
    },
    {
      name: 'planetaryExtractionDone, named',
      render: () => colonyCopy.poll(extractionDone(40009), PILOT, { planet: 'Amarr III' }),
      expected: {
        title: 'Extraction done',
        body: "Kestrel's extraction on Amarr III has stopped.",
      },
    },
    {
      name: 'planetaryExtractionDone, unresolved',
      render: () => colonyCopy.poll(extractionDone(7), PILOT, {}),
      expected: { title: 'Extraction done', body: "Kestrel's extraction on #7 has stopped." },
    },
    {
      name: 'planetaryExtractorExpiring',
      render: () =>
        colonyCopy.poll(extractorExpiring(40009, 12 * HOUR_MS), PILOT, { planet: 'Amarr III' }),
      expected: {
        title: 'Extractor expiring',
        body: "Kestrel's extractor on Amarr III expires in under 12 hours.",
      },
    },
    {
      name: 'newMail',
      render: () => mailCopy.poll({ eventId: 'newMail', characterId: C, mailId: 1 }, PILOT, {}),
      expected: { title: 'New mail', body: 'Kestrel has new mail.' },
    },
    {
      name: 'newCalendarEvent, named with a start',
      render: () =>
        calendarCopy.poll(
          {
            eventId: 'newCalendarEvent',
            characterId: C,
            calendarEventId: 1,
            startMs: 0,
            title: 'Fleet Op',
          },
          PILOT,
          { when: 'Sep 25, 7:00 PM' }
        ),
      expected: {
        title: 'New calendar event',
        body: 'Kestrel: Fleet Op was added, starting Sep 25, 7:00 PM.',
      },
    },
    {
      name: 'newCalendarEvent, untitled',
      render: () =>
        calendarCopy.poll(
          { eventId: 'newCalendarEvent', characterId: C, calendarEventId: 1, startMs: 0 },
          PILOT,
          { when: 'Sep 25, 7:00 PM' }
        ),
      expected: { title: 'New calendar event', body: 'Kestrel has a new calendar event.' },
    },
    {
      name: 'newCalendarEvent, no usable start',
      render: () =>
        calendarCopy.poll(
          {
            eventId: 'newCalendarEvent',
            characterId: C,
            calendarEventId: 1,
            startMs: NaN,
            title: 'Fleet Op',
          },
          PILOT,
          {}
        ),
      expected: { title: 'New calendar event', body: 'Kestrel has a new calendar event.' },
    },
    {
      name: 'calendarEventStarting, named',
      render: () =>
        calendarCopy.poll(
          {
            eventId: 'calendarEventStarting',
            characterId: C,
            calendarEventId: 1,
            title: 'Fleet Op',
          },
          PILOT,
          {}
        ),
      expected: { title: 'Calendar event starting', body: 'Kestrel: Fleet Op is starting.' },
    },
    {
      name: 'calendarEventStarting, untitled',
      render: () =>
        calendarCopy.poll(
          { eventId: 'calendarEventStarting', characterId: C, calendarEventId: 1 },
          PILOT,
          {}
        ),
      expected: { title: 'Calendar event starting', body: "Kestrel's calendar event is starting." },
    },
    ...(
      [
        ['contractAccepted', 'Contract accepted', "Kestrel's contract was accepted."],
        ['contractCompleted', 'Contract completed', "Kestrel's contract was completed."],
        ['contractFailed', 'Contract failed', "Kestrel's contract failed."],
      ] as const
    ).map(([eventId, title, body]) => ({
      name: eventId,
      render: () => contractCopy.poll({ eventId, characterId: C, contractId: 3 }, PILOT, {}),
      expected: { title, body },
    })),
    {
      name: 'walletBalanceChanged, no amount',
      render: () =>
        walletCopy.poll(
          {
            eventId: 'walletBalanceChanged',
            characterId: C,
            amount: null,
            journalEntryId: 4,
            dateMs: 1,
          },
          PILOT,
          {}
        ),
      expected: { title: 'Wallet balance changed', body: "Kestrel's wallet balance changed." },
    },
    {
      name: 'walletBalanceChanged, with amount',
      render: () =>
        walletCopy.poll(
          {
            eventId: 'walletBalanceChanged',
            characterId: C,
            amount: -1234567.891,
            journalEntryId: 4,
            dateMs: 1,
          },
          PILOT,
          {}
        ),
      expected: {
        title: 'Wallet balance changed',
        body: "Kestrel's wallet balance changed by -1,234,567.89 ISK.",
      },
    },
    {
      name: 'marketOrderFilled, single unit',
      render: () =>
        marketOrderCopy.poll(
          { eventId: 'marketOrderFilled', characterId: C, orderId: 1, typeId: 34, quantity: 1 },
          PILOT,
          { item: 'Tritanium' }
        ),
      expected: { title: 'Sell order filled', body: 'Someone bought Tritanium from Kestrel.' },
    },
    {
      name: 'marketOrderFilled, quantity',
      render: () =>
        marketOrderCopy.poll(
          { eventId: 'marketOrderFilled', characterId: C, orderId: 1, typeId: 34, quantity: 25000 },
          PILOT,
          { item: 'Tritanium' }
        ),
      expected: {
        title: 'Sell order filled',
        body: 'Someone bought 25,000 x Tritanium from Kestrel.',
      },
    },
    {
      name: 'marketOrderFilled, unresolved',
      render: () =>
        marketOrderCopy.poll(
          { eventId: 'marketOrderFilled', characterId: C, orderId: 1, typeId: 35, quantity: 2 },
          PILOT,
          {}
        ),
      expected: { title: 'Sell order filled', body: 'Someone bought 2 x #35 from Kestrel.' },
    },
    {
      name: 'eveNotification (delegates to eveNotificationText)',
      render: () =>
        eveNotificationCopy.poll(
          {
            eventId: 'eveNotification',
            characterId: C,
            notificationId: 1,
            type: 'StructureFuelAlert',
            senderId: 2,
            senderType: 'corporation',
            text: 'structureID: 1021\n',
            timestamp: '2026-09-22T00:00:00Z',
          },
          PILOT,
          { structure: 'Keepstar' }
        ),
      expected: {
        title: 'Structure low on fuel',
        body: 'Kestrel: Keepstar is running out of fuel.',
      },
    },
    {
      name: 'structureFuelLow',
      render: () => structureFuelCopy.poll(fuelLow, PILOT, {}),
      expected: {
        title: 'Structure fuel low',
        body: 'Kestrel: Keepstar has less than 3 days of fuel remaining.',
      },
    },
    {
      name: 'corpIndustryJobReady, named',
      render: () => corpIndustryJobCopy.poll(corpJob(691, 587), PILOT, { item: 'Rifter' }),
      expected: {
        title: 'Corp industry job ready for delivery',
        body: "Kestrel: the corporation's Rifter job is ready for delivery.",
      },
    },
    {
      name: 'corpIndustryJobReady, unresolved blueprint',
      render: () => corpIndustryJobCopy.poll(corpJob(2, null), PILOT, {}),
      expected: {
        title: 'Corp industry job ready for delivery',
        body: "Kestrel: the corporation's #2 job is ready for delivery.",
      },
    },
    {
      name: 'corpMemberJoined',
      render: () =>
        corpRosterCopy.poll(
          { eventId: 'corpMemberJoined', characterId: C, memberCharacterId: 9001 },
          PILOT,
          { member: 'New Guy' }
        ),
      expected: { title: 'Member joined', body: 'Kestrel: New Guy joined the corporation.' },
    },
    {
      name: 'corpMemberLeft, unresolved',
      render: () =>
        corpRosterCopy.poll(
          { eventId: 'corpMemberLeft', characterId: C, memberCharacterId: 9002 },
          PILOT,
          {}
        ),
      expected: { title: 'Member left', body: 'Kestrel: #9002 left the corporation.' },
    },
    {
      name: 'corpWalletThreshold, balance below',
      render: () =>
        corpWalletCopy.poll(
          {
            eventId: 'corpWalletThreshold',
            characterId: C,
            kind: 'balanceBelow',
            division: 2,
            balance: 5_000_000,
            thresholdIsk: 1,
          },
          PILOT,
          {}
        ),
      expected: {
        title: 'Corp wallet threshold',
        body: 'Kestrel: corp wallet division 2 dropped to 5,000,000.00 ISK.',
      },
    },
    {
      name: 'corpWalletThreshold, transaction above (absolute amount)',
      render: () =>
        corpWalletCopy.poll(
          {
            eventId: 'corpWalletThreshold',
            characterId: C,
            kind: 'transactionAbove',
            division: 1,
            amount: -250_000_000.5,
            thresholdIsk: 1,
            journalEntryId: 8,
          },
          PILOT,
          {}
        ),
      expected: {
        title: 'Corp wallet threshold',
        body: 'Kestrel: a 250,000,000.50 ISK transaction posted to corp wallet division 1.',
      },
    },
    ...(
      [
        ['above', 5.5, 'Tritanium reached 5.50 ISK, at or above your 5.00 ISK target.'],
        ['below', 4.5, 'Tritanium reached 4.50 ISK, at or below your 5.00 ISK target.'],
      ] as const
    ).map(([direction, price, body]) => ({
      name: `priceAlertTriggered, ${direction}`,
      render: () =>
        priceAlertCopy.poll(
          {
            eventId: 'priceAlertTriggered',
            characterId: C,
            typeId: 34,
            name: 'Tritanium',
            price,
            targetPrice: 5,
            direction,
          },
          PILOT,
          {}
        ),
      expected: { title: 'Price alert', body },
    })),
  ]);
});

describe('push copy', () => {
  table([
    {
      name: 'skillLevelComplete, named',
      render: () => skillQueueCopy.push(skill(3300, 3), PILOT, { skill: 'Gunnery' }),
      expected: {
        title: 'Skill training complete',
        body: 'Kestrel finished training Gunnery III.',
      },
    },
    {
      // Unlike the poll copy, an out-of-range level prints as a number.
      name: 'skillLevelComplete, unresolved name and out-of-range level',
      render: () => skillQueueCopy.push(skill(1, 0), PILOT, {}),
      expected: { title: 'Skill training complete', body: 'Kestrel finished training #1 0.' },
    },
    {
      name: 'characterNotTraining',
      render: () => skillQueueCopy.push(notTraining, PILOT, {}),
      expected: { title: 'Not training', body: 'Kestrel has no skill in training.' },
    },
    {
      name: 'industryJobComplete, named',
      render: () => industryJobCopy.push(job(691, 587), PILOT, { item: 'Rifter' }),
      expected: {
        title: 'Industry job complete',
        body: "Kestrel's industry job for Rifter is complete.",
      },
    },
    {
      name: 'industryJobComplete, unresolved',
      render: () => industryJobCopy.push(job(2, 99), PILOT, {}),
      expected: {
        title: 'Industry job complete',
        body: "Kestrel's industry job for #99 is complete.",
      },
    },
    {
      name: 'planetaryExtractionDone hedges, title included',
      render: () => colonyCopy.push(extractionDone(40009), PILOT, { planet: 'Amarr III' }),
      expected: {
        title: 'Extraction due to stop',
        body: "Kestrel's extraction on Amarr III was due to stop.",
      },
    },
    {
      name: 'planetaryExtractionDone, unresolved',
      render: () => colonyCopy.push(extractionDone(7), PILOT, {}),
      expected: {
        title: 'Extraction due to stop',
        body: "Kestrel's extraction on #7 was due to stop.",
      },
    },
    {
      name: 'planetaryExtractorExpiring hedges, title included',
      render: () =>
        colonyCopy.push(extractorExpiring(40009, 12 * HOUR_MS), PILOT, { planet: 'Amarr III' }),
      expected: {
        title: 'Extractor due to expire',
        body: "Kestrel's extractor on Amarr III was due to expire in under 12 hours.",
      },
    },
    {
      name: 'calendarEventStarting, named',
      render: () =>
        calendarCopy.push(
          {
            eventId: 'calendarEventStarting',
            characterId: C,
            calendarEventId: 1,
            title: 'Fleet Op',
          },
          PILOT,
          {}
        ),
      expected: { title: 'Calendar event starting', body: 'Kestrel: Fleet Op is starting.' },
    },
    {
      name: 'calendarEventStarting, untitled',
      render: () =>
        calendarCopy.push(
          { eventId: 'calendarEventStarting', characterId: C, calendarEventId: 1 },
          PILOT,
          {}
        ),
      expected: { title: 'Calendar event starting', body: "Kestrel's calendar event is starting." },
    },
    {
      name: 'structureFuelLow hedges its body, not its title',
      render: () => structureFuelCopy.push(fuelLow, PILOT, {}),
      expected: {
        title: 'Structure fuel low',
        body: 'Kestrel: Keepstar was due to run out of fuel.',
      },
    },
    ...(
      [
        [{ payloadStructureName: 'Fort', resolvedStructureName: 'Keep', structureId: 111 }, 'Fort'],
        [{ resolvedStructureName: 'Keepstar', structureId: 111 }, 'Keepstar'],
        [{ structureId: 111 }, 'structure #111'],
        [{}, 'a structure'],
      ] as const
    ).map(([names, label]) => ({
      name: `reinforcement exit labelled "${label}"`,
      render: () =>
        eveNotificationCopy.push(
          { eventId: 'structureReinforcementExit', characterId: C, notificationId: 1 },
          PILOT,
          names
        ),
      expected: {
        title: 'Structure coming out of reinforcement',
        body: `Kestrel: ${label} exits reinforcement soon.`,
      },
    })),
  ]);
});

describe('subject routes', () => {
  it('reads each subject-routed event from the field its own diff sets', () => {
    expect(
      marketOrderCopy.subjectOf!({
        eventId: 'marketOrderFilled',
        characterId: C,
        orderId: 1,
        typeId: 34,
        quantity: 1,
      })
    ).toEqual(34);
    expect(
      walletCopy.subjectOf!({
        eventId: 'walletBalanceChanged',
        characterId: C,
        amount: 1,
        journalEntryId: 77,
        dateMs: 1,
      })
    ).toEqual(77);
    for (const eventId of ['contractAccepted', 'contractCompleted', 'contractFailed'] as const) {
      expect(contractCopy.subjectOf!({ eventId, characterId: C, contractId: 5 })).toEqual(5);
    }
    expect(industryJobCopy.subjectOf!(job(1, 2))).toEqual(5);
    expect(
      corpRosterCopy.subjectOf!({
        eventId: 'corpMemberJoined',
        characterId: C,
        memberCharacterId: 12,
      })
    ).toEqual(12);
    expect(
      priceAlertCopy.subjectOf!({
        eventId: 'priceAlertTriggered',
        characterId: C,
        typeId: 34,
        name: 'Tritanium',
        price: 1,
        targetPrice: 1,
        direction: 'above',
      })
    ).toEqual(34);
  });

  it('reads nothing for a member who left: that roster row is gone', () => {
    expect(
      corpRosterCopy.subjectOf!({
        eventId: 'corpMemberLeft',
        characterId: C,
        memberCharacterId: 12,
      })
    ).toBeUndefined();
  });
});
