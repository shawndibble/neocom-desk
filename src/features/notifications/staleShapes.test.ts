/**
 * "Stale shape" pins: what every domain's persisted-baseline guard accepts and
 * rejects. A stored baseline is only reused when it parses, so the optional
 * fields (added after snapshots already existed) must stay optional, and the
 * required ones must stay required — a looser guard reads an old baseline with
 * fields missing, a stricter one discards the baseline and re-announces
 * everything as new. Driven through each domain's own store so it holds
 * whatever the guard is built from.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { EMPTY_POLLER_STATE } from './pollerState';
import type { PollDomain } from './pollDomains';
import { skillQueueDomain } from './pollDomains/skillQueue';
import { spExtractionDomain } from './pollDomains/spExtraction';
import { cloneJumpDomain } from './pollDomains/cloneJump';
import { industryJobDomain } from './pollDomains/industryJobs';
import { colonyDomain } from './pollDomains/colonies';
import { mailDomain } from './pollDomains/mail';
import { calendarDomain } from './pollDomains/calendar';
import { contractDomain } from './pollDomains/contracts';
import { walletDomain } from './pollDomains/wallet';
import {
  marketOrderDomain,
  marketOrderUndercutDomain,
  orderExpiryDomain,
} from './pollDomains/marketOrders';
import { eveNotificationDomain } from './pollDomains/eveNotifications';
import {
  structureFuelDomain,
  corpIndustryJobDomain,
  corpRosterDomain,
  corpWalletDomain,
} from './pollDomains/corp';
import { priceAlertDomain } from './pollDomains/priceAlerts';
import { stockTargetDomain } from './pollDomains/stockTargets';
import { incursionDomain } from './pollDomains/incursions';
import { communitiesDomain } from './pollDomains/communities';
import { killsDomain } from './pollDomains/kills';
import { mercenaryDensDomain } from './pollDomains/mercenaryDens';

type Entry = Record<string, unknown>;

interface Case {
  name: string;
  domain: PollDomain;
  /** The snapshot's array field. */
  key?: string;
  /** Every required field, valid. Nullable ones are listed in `nullable`. */
  base: Entry;
  /** Fields a baseline written before they existed lacks — absent must pass. */
  optional?: Entry;
  /** Required fields that also accept `null` (but never absent). */
  nullable?: string[];
  /** A value of the right primitive type but outside the field's enum. */
  badEnum?: Record<string, unknown>;
}

const CASES: Case[] = [
  {
    name: 'skill queue',
    domain: skillQueueDomain,
    base: { skillId: 1, finishedLevel: 3, queuePosition: 0, finishMs: 12345 },
    optional: { endingLeadMs: 3_600_000 },
    nullable: ['finishMs'],
  },
  {
    name: 'SP extraction',
    domain: spExtractionDomain,
    base: { totalSp: 5_000_000, thresholdSp: 5_500_000 },
  },
  {
    name: 'clone jump',
    domain: cloneJumpDomain,
    base: { lastJumpMs: 100, readyAtMs: 200 },
  },
  {
    name: 'industry jobs',
    domain: industryJobDomain,
    base: { jobId: 1, endMs: 5, blueprintTypeId: 100, productTypeId: 200, activityId: 1 },
    nullable: ['productTypeId'],
  },
  {
    name: 'mail',
    domain: mailDomain,
    base: { mailId: 5 },
    optional: { sentMs: 1000, fromId: 90000001 },
  },
  {
    name: 'calendar',
    domain: calendarDomain,
    base: { calendarEventId: 1, startMs: 12345 },
    optional: { title: 'Fleet', response: 'accepted' },
    badEnum: { response: 'maybe' },
  },
  {
    name: 'contracts',
    domain: contractDomain,
    base: { contractId: 1, status: 'outstanding', issuerId: 2, acceptorId: 3 },
    optional: {
      deliveryDeadlineMs: 1,
      dueLeadMs: 2,
      expiresMs: 3,
      expiringLeadMs: 4,
      dateAcceptedMs: 5,
      dateCompletedMs: 6,
    },
    badEnum: { status: 'lost' },
  },
  {
    name: 'wallet',
    domain: walletDomain,
    base: { id: 5, amount: 100, thresholdIsk: 0, dateMs: 999 },
    nullable: ['amount'],
  },
  {
    name: 'market orders',
    domain: marketOrderDomain,
    base: { orderId: 1, filled: false, isBuyOrder: true, typeId: 34, quantity: 100 },
    optional: { locationId: 60003760, price: 5.5, issuedMs: 1000, isCorporation: true },
  },
  {
    name: 'market order undercut',
    domain: marketOrderUndercutDomain,
    base: {
      orderId: 1,
      typeId: 34,
      isBuyOrder: false,
      locationId: 60003760,
      price: 5,
      state: 'beaten',
      rivalPrice: 4,
      armed: true,
    },
    nullable: ['rivalPrice'],
    badEnum: { state: 'maybe' },
  },
  {
    name: 'order expiry',
    domain: orderExpiryDomain,
    base: { orderId: 1, expiresMs: 100, leadMs: 5 },
  },
  {
    name: 'EVE notifications',
    domain: eveNotificationDomain,
    base: {
      notificationId: 1,
      type: 'StructureUnderAttack',
      senderId: 2,
      senderType: 'corporation',
      text: 'x: y',
      timestamp: '2026-01-01T00:00:00Z',
    },
  },
  {
    name: 'structure fuel',
    domain: structureFuelDomain,
    base: { structureId: 1, name: 'Keepstar', fuelExpiresMs: 100, thresholdMs: 5 },
    nullable: ['fuelExpiresMs'],
  },
  {
    name: 'corp industry jobs',
    domain: corpIndustryJobDomain,
    base: { jobId: 1, endMs: 5, blueprintTypeId: 100, productTypeId: 200, activityId: 1 },
    nullable: ['productTypeId'],
  },
  {
    name: 'corp roster',
    domain: corpRosterDomain,
    base: { characterId: 90000001 },
  },
  {
    name: 'price alerts',
    domain: priceAlertDomain,
    base: { typeId: 34, name: 'Tritanium', targetPrice: 5, direction: 'above', price: 4 },
    nullable: ['price'],
    badEnum: { direction: 'sideways' },
  },
  {
    name: 'stock targets',
    domain: stockTargetDomain,
    base: {
      listId: 'l1',
      listName: 'Jita',
      locationId: 60003760,
      typeId: 34,
      name: 'Tritanium',
      target: 10,
      listed: 3,
      inHangar: 2,
    },
    nullable: ['listed'],
  },
  {
    name: 'incursions',
    domain: incursionDomain,
    base: {
      constellationId: 1,
      stagingSystemId: 2,
      state: 'mobilizing',
      jumps: 4,
      originSystemId: 3,
      withinJumps: 5,
    },
    nullable: ['jumps'],
    badEnum: { state: 'retreating' },
  },
  {
    name: 'communities',
    domain: communitiesDomain,
    base: {
      communityId: 'c1',
      communityName: 'Corp',
      kind: 'request',
      uid: 'u1',
      characterName: 'Pilot',
      at: 1000,
    },
    optional: { requestId: 'r1', requestLabel: 'Hull' },
    badEnum: { kind: 'invite' },
  },
  {
    name: 'kills',
    domain: killsDomain,
    base: { killmailId: 1, timeMs: 1000, thresholdIsk: 0 },
    optional: { shipTypeId: 587, systemId: 30000142, value: 1_000_000 },
  },
  {
    name: 'mercenary dens',
    domain: mercenaryDensDomain,
    base: {
      denId: 1,
      planetId: 40_000_001,
      reinforcedUntilMs: 100,
      anarchyAmount: 10,
      anarchyLevel: 1,
      leadMs: 5,
      anarchyPct: 50,
    },
    nullable: ['reinforcedUntilMs', 'anarchyAmount', 'anarchyLevel'],
  },
];

/** Stores a one-character snapshot around `entries` and reports whether it survived parsing. */
async function survives(domain: PollDomain, entries: unknown[], key = 'entries'): Promise<boolean> {
  await db.settings.put({ key: domain.stateKey, value: { 7: { [key]: entries, nowMs: 1 } } });
  domain.store.setState({ value: EMPTY_POLLER_STATE, hydrated: false });
  await domain.store.getState().hydrate();
  return Object.keys(domain.store.getState().value).length > 0;
}

/** A value of the right primitive type for the field, but wrong for the type. */
function wrongType(sample: unknown): unknown {
  if (typeof sample === 'number') return '1';
  if (typeof sample === 'boolean') return 1;
  return 42;
}

function without(entry: Entry, field: string): Entry {
  const copy = { ...entry };
  delete copy[field];
  return copy;
}

beforeEach(async () => {
  await db.settings.clear();
});

describe.each(CASES)('stale shapes: $name', (c) => {
  const key = c.key ?? 'entries';
  const nullable = new Set(c.nullable ?? []);
  const optionalKeys = Object.keys(c.optional ?? {});
  const full: Entry = { ...c.base, ...c.optional };

  it('accepts a full entry, and an empty snapshot', async () => {
    expect(await survives(c.domain, [full], key)).toBe(true);
    expect(await survives(c.domain, [], key)).toBe(true);
  });

  it('accepts an entry written before the optional fields existed', async () => {
    expect(await survives(c.domain, [c.base], key)).toBe(true);
    for (const field of optionalKeys) {
      expect(await survives(c.domain, [without(full, field)], key)).toBe(true);
    }
  });

  it('rejects an entry missing any required field', async () => {
    for (const field of Object.keys(c.base)) {
      expect(await survives(c.domain, [without(full, field)], key)).toBe(false);
    }
  });

  it('rejects a wrong-typed field, and null where null is not part of the type', async () => {
    for (const [field, sample] of Object.entries(full)) {
      const bad = c.badEnum?.[field] ?? wrongType(sample);
      expect(await survives(c.domain, [{ ...full, [field]: bad }], key)).toBe(false);
      const nullAllowed = nullable.has(field);
      expect(await survives(c.domain, [{ ...full, [field]: null }], key)).toBe(nullAllowed);
    }
  });

  it('accepts either null or a number for a nullable numeric field', async () => {
    for (const field of nullable) {
      expect(await survives(c.domain, [{ ...full, [field]: null }], key)).toBe(true);
      expect(await survives(c.domain, [{ ...full, [field]: 7 }], key)).toBe(true);
    }
  });

  it('discards the whole snapshot when one entry is bad', async () => {
    const [firstField] = Object.keys(c.base);
    expect(await survives(c.domain, [full, { ...full, [firstField]: {} }], key)).toBe(false);
  });

  it('rejects entries that are not objects', async () => {
    for (const junk of [null, 'x', 7, true]) {
      expect(await survives(c.domain, [junk], key)).toBe(false);
    }
  });
});

describe('stale shapes: details the table cannot express', () => {
  it('accepts NaN and Infinity where the old guard only checked typeof number', async () => {
    const entry = { lastJumpMs: NaN, readyAtMs: Infinity };
    expect(await survives(cloneJumpDomain, [entry])).toBe(true);
  });

  it('wallet dateMs must be finite, not merely a number', async () => {
    const entry = { id: 5, amount: 100, thresholdIsk: 0 };
    expect(await survives(walletDomain, [{ ...entry, dateMs: 1 }])).toBe(true);
    expect(await survives(walletDomain, [{ ...entry, dateMs: NaN }])).toBe(false);
    expect(await survives(walletDomain, [{ ...entry, dateMs: Infinity }])).toBe(false);
    expect(await survives(walletDomain, [{ ...entry, dateMs: '1' }])).toBe(false);
  });

  it('every calendar response and contract status literal is accepted', async () => {
    for (const response of ['declined', 'not_responded', 'accepted', 'tentative']) {
      expect(await survives(calendarDomain, [{ calendarEventId: 1, startMs: 1, response }])).toBe(
        true
      );
    }
    for (const status of [
      'outstanding',
      'in_progress',
      'finished_issuer',
      'finished_contractor',
      'finished',
      'cancelled',
      'rejected',
      'failed',
      'deleted',
      'reversed',
    ]) {
      expect(
        await survives(contractDomain, [{ contractId: 1, status, issuerId: 1, acceptorId: 1 }])
      ).toBe(true);
    }
  });

  it('every price direction, undercut state, incursion state and community kind is accepted', async () => {
    const price = { typeId: 1, name: 'x', targetPrice: 1, price: null };
    for (const direction of ['above', 'below']) {
      expect(await survives(priceAlertDomain, [{ ...price, direction }])).toBe(true);
    }
    const undercut = {
      orderId: 1,
      typeId: 1,
      isBuyOrder: true,
      locationId: 1,
      price: 1,
      rivalPrice: null,
      armed: false,
    };
    for (const state of ['beaten', 'clear', 'unknown']) {
      expect(await survives(marketOrderUndercutDomain, [{ ...undercut, state }])).toBe(true);
    }
    const incursion = {
      constellationId: 1,
      stagingSystemId: 1,
      jumps: null,
      originSystemId: 1,
      withinJumps: 1,
    };
    for (const state of ['mobilizing', 'established', 'withdrawing']) {
      expect(await survives(incursionDomain, [{ ...incursion, state }])).toBe(true);
    }
    const community = { communityId: 'c', communityName: 'n', uid: 'u', characterName: 'p', at: 1 };
    for (const kind of ['request', 'member', 'pledgeRequest', 'pledge']) {
      expect(await survives(communitiesDomain, [{ ...community, kind }])).toBe(true);
    }
  });

  describe('planetary colonies (nested extractors, snapshot key "colonies")', () => {
    const extractor = { pinId: 1, expiryTimeMs: 2, thresholdMs: 3 };
    const colony = { planetId: 40000001, extractors: [extractor] };

    it('accepts an extractor written before installTimeMs existed, and one with it', async () => {
      expect(await survives(colonyDomain, [colony], 'colonies')).toBe(true);
      const withInstall = { ...colony, extractors: [{ ...extractor, installTimeMs: 9 }] };
      expect(await survives(colonyDomain, [withInstall], 'colonies')).toBe(true);
      expect(await survives(colonyDomain, [{ planetId: 1, extractors: [] }], 'colonies')).toBe(
        true
      );
    });

    it('rejects a bad extractor, a non-array extractors, or a missing planetId', async () => {
      for (const bad of [
        { ...colony, extractors: [{ ...extractor, installTimeMs: null }] },
        { ...colony, extractors: [{ ...extractor, installTimeMs: '9' }] },
        { ...colony, extractors: [without(extractor, 'thresholdMs')] },
        { ...colony, extractors: [{ ...extractor, pinId: '1' }] },
        { ...colony, extractors: [null] },
        { ...colony, extractors: 'nope' },
        { extractors: [extractor] },
        { ...colony, planetId: '1' },
      ]) {
        expect(await survives(colonyDomain, [bad], 'colonies')).toBe(false);
      }
    });

    it('does not read the snapshot from "entries"', async () => {
      expect(await survives(colonyDomain, [colony], 'entries')).toBe(false);
    });
  });

  describe('corp wallet (nested journal, snapshot key "divisions")', () => {
    const division = {
      division: 1,
      balance: 100,
      journal: [{ id: 1, amount: 5 }],
      balanceFloorIsk: 0,
      transactionCeilingIsk: 10,
    };

    it('accepts divisions with journal entries of either amount form, or no journal', async () => {
      expect(await survives(corpWalletDomain, [division], 'divisions')).toBe(true);
      expect(
        await survives(
          corpWalletDomain,
          [{ ...division, journal: [{ id: 1, amount: null }] }],
          'divisions'
        )
      ).toBe(true);
      expect(await survives(corpWalletDomain, [{ ...division, journal: [] }], 'divisions')).toBe(
        true
      );
    });

    it('rejects a bad journal entry, a non-array journal, or a missing field', async () => {
      for (const bad of [
        { ...division, journal: [{ id: 1 }] },
        { ...division, journal: [{ amount: 1 }] },
        { ...division, journal: [{ id: '1', amount: 1 }] },
        { ...division, journal: [null] },
        { ...division, journal: 'nope' },
        without(division, 'journal'),
        without(division, 'balance'),
        without(division, 'division'),
        without(division, 'balanceFloorIsk'),
        without(division, 'transactionCeilingIsk'),
      ]) {
        expect(await survives(corpWalletDomain, [bad], 'divisions')).toBe(false);
      }
    });

    it('does not read the snapshot from "entries"', async () => {
      expect(await survives(corpWalletDomain, [division], 'entries')).toBe(false);
    });
  });
});
