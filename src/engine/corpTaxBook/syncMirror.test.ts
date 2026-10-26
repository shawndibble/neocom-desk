import { describe, expect, it } from 'vitest';
import * as mirror from '../../../functions/src/corpTaxBookSyncEngine';
import { parseEveNotificationPayload } from '../eveNotificationPayload';
import { matchDonation } from './allocation';
import type { Dismissal } from './dismissals';
import {
  MOON_NOTIFICATION_TYPES,
  detectGaps,
  donationsFromJournal,
  mergeGaps,
  observedRowsFromLedger,
  placeObservedRows,
  planSettlements,
  reconcileExtractions,
  resolveDonations,
  restampPlan,
  stampExtractionIds,
  type MoonNotification,
  type SyncExtraction,
} from './sync';
import type { Statement } from './statements';
import { SCHEDULED_STOP_REASONS } from './scheduledSync';

// The scheduled server sync (ADR 0025) runs a mirror of the officer sync's pure
// half (functions/src/corpTaxBookSyncEngine.ts), because `functions/` cannot
// import `src/`. Same inputs, same outputs.

const NOW = Date.parse('2026-10-18T12:00:00Z');

describe('functions mirror of the Corp Tax Book sync engine', () => {
  it('reads the same moon notification types and uses the same stop reasons as the client', () => {
    expect([...mirror.MOON_NOTIFICATION_TYPES]).toEqual([...MOON_NOTIFICATION_TYPES]);
    expect([...mirror.SCHEDULED_STOP_REASONS]).toEqual([...SCHEDULED_STOP_REASONS]);
  });

  it('shapes the observer ledger the same way', () => {
    const rows = [
      {
        character_id: 1,
        recorded_corporation_id: 2,
        type_id: 3,
        quantity: 5,
        last_updated: '2026-10-17',
      },
      {
        character_id: 1,
        recorded_corporation_id: 2,
        type_id: 3,
        quantity: 0,
        last_updated: '2026-10-17',
      },
      {
        character_id: 1,
        recorded_corporation_id: 2,
        type_id: 3,
        quantity: 1.5,
        last_updated: '2026-10-17',
      },
      {
        character_id: 1,
        recorded_corporation_id: 2,
        type_id: 3,
        quantity: 9,
        last_updated: 'soon',
      },
    ];
    expect(mirror.observedRowsFromLedger(7, rows, '2026-10-18T00:00:00Z')).toEqual(
      observedRowsFromLedger(7, rows, '2026-10-18T00:00:00Z')
    );
    expect(mirror.observedRowsFromLedger(7, rows, '2026-10-18T00:00:00Z', 98000002)).toEqual(
      observedRowsFromLedger(7, rows, '2026-10-18T00:00:00Z', 98000002)
    );
  });

  it('detects and merges gaps the same way', () => {
    const inputs = [
      { lastSyncAt: null, oldest: {} },
      { lastSyncAt: NOW - 3 * 86_400_000, oldest: {} },
      { lastSyncAt: NOW - 60 * 86_400_000, oldest: { 1: '2026-09-01', 2: '2026-10-10' } },
      { lastSyncAt: NOW - 60 * 86_400_000, oldest: { 1: '2026-08-01' } },
    ];
    for (const { lastSyncAt, oldest } of inputs) {
      const input = {
        lastSyncAt,
        now: NOW,
        startDate: '2026-07-01',
        structureIds: [1, 2],
        oldestEsiDate: oldest as Record<number, string>,
      };
      expect(mirror.detectGaps(input)).toEqual(detectGaps(input));
    }
    const prior = [
      { structureId: 1, from: '2026-08-01', to: '2026-08-10' },
      { structureId: 1, from: '2026-08-11', to: '2026-08-12' },
      { structureId: 2, from: '2026-08-05', to: '2026-08-06' },
    ];
    const fresh = [{ structureId: 1, from: '2026-08-20', to: '2026-08-21' }];
    expect(mirror.mergeGaps(prior, fresh)).toEqual(mergeGaps(prior, fresh));
    const many = Array.from({ length: 30 }, (_, i) => ({
      structureId: i + 1,
      from: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
      to: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
    expect(mirror.mergeGaps(many, [])).toEqual(mergeGaps(many, []));
  });

  it('picks, resolves and matches donations the same way', () => {
    const entries = [
      {
        id: 1,
        date: '2026-10-17T10:00:00Z',
        ref_type: 'player_donation',
        amount: 5e6,
        first_party_id: 50,
        reason: 'pay ABC123 thanks',
      },
      {
        id: 2,
        date: '2026-10-17T11:00:00Z',
        ref_type: 'player_donation',
        amount: 6e6,
        first_party_id: 51,
      },
      {
        id: 3,
        date: '2026-10-17T11:00:00Z',
        ref_type: 'player_donation',
        amount: 6e6,
        first_party_id: 99,
      },
      {
        id: 4,
        date: '2026-10-17T11:00:00Z',
        ref_type: 'player_donation',
        amount: 6e6,
        first_party_id: 98000001,
      },
      {
        id: 5,
        date: '2026-10-17T11:00:00Z',
        ref_type: 'bounty_prizes',
        amount: 6e6,
        first_party_id: 50,
      },
      { id: 6, date: 'nope', ref_type: 'player_donation', amount: 6e6, first_party_id: 50 },
      {
        id: 7,
        date: '2026-10-17T11:00:00Z',
        ref_type: 'player_donation',
        amount: -1,
        first_party_id: 50,
      },
    ];
    const donations = donationsFromJournal(entries, 1, 98000001);
    expect(mirror.donationsFromJournal(entries, 1, 98000001)).toEqual(donations);
    const miners = [
      { id: 'm1', characterIds: [50, 52], mainCharacterId: 50 },
      { id: 'solo:51', characterIds: [51], mainCharacterId: 51 },
    ];
    const statements = [{ id: 's1', minerId: 'm1', code: 'ABC123' }] as unknown as Statement[];
    const book = { miners, statements, knownCharacterIds: new Set([99]) };
    expect(mirror.resolveDonations(donations, book)).toEqual(resolveDonations(donations, book));
    for (const characterId of [50, 51, 52, 99, 12345]) {
      for (const reason of [undefined, '', 'abc123', 'xABC123', 'ABC1234', 'ABC123 now']) {
        expect(mirror.matchDonation({ characterId, reason }, book)).toEqual(
          matchDonation({ characterId, reason }, book)
        );
      }
    }
  });

  describe('extractions', () => {
    const ticks = (ms: number) => (ms + 11_644_473_600_000) * 10_000;
    const started = (structureId: number, moonId: number, ready: number, auto: number) =>
      [
        `structureID: &id001 ${structureId}`,
        `moonID: ${moonId}`,
        `readyTime: ${ticks(ready)}`,
        `autoTime: ${ticks(auto)}`,
        'oreVolumeByType:',
        '  46300: 6022254.47',
        '  46301: 100000',
        'solarSystemID: 30000142',
      ].join('\n');
    const arrival = Date.parse('2026-10-17T00:00:00Z');
    const decay = Date.parse('2026-10-17T03:00:00Z');

    it('parses the moon fields of a notification the same way', () => {
      const texts = [
        started(1000, 7, arrival, decay),
        'structureID: 5\nmoonID: 6\noreVolumeByType: {46300: 12, 46301: 0}',
        'structureID: "x"\nreadyTime: 0',
        '',
      ];
      for (const text of texts) {
        const theirs = mirror.parseMoonPayload(text);
        const ours = parseEveNotificationPayload(text);
        expect(theirs).toEqual({
          structureId: ours.structureId,
          moonId: ours.moonId,
          readyTimeMs: ours.readyTimeMs,
          autoTimeMs: ours.autoTimeMs,
          oreVolumes: ours.oreVolumes,
        });
      }
    });

    it('reconciles ESI, notifications and stored Extractions the same way', () => {
      const esi = [
        {
          structure_id: 1000,
          moon_id: 7,
          extraction_start_time: '2026-10-10T00:00:30Z',
          chunk_arrival_time: '2026-10-17T00:00:00Z',
          natural_decay_time: '2026-10-17T03:00:00Z',
        },
        {
          structure_id: 2000,
          moon_id: 9,
          extraction_start_time: '2026-10-12T00:00:00Z',
          chunk_arrival_time: '2026-10-20T00:00:00Z',
          natural_decay_time: '2026-10-20T03:00:00Z',
        },
      ];
      const texts = {
        started: started(1000, 7, arrival, decay),
        orphan: started(3000, 11, arrival + 86_400_000, decay + 86_400_000),
      };
      const notes: { type: string; timestamp: string; text: string }[] = [
        {
          type: 'MoonminingExtractionStarted',
          timestamp: '2026-10-10T00:00:00Z',
          text: texts.started,
        },
        {
          type: 'MoonminingExtractionStarted',
          timestamp: '2026-10-11T00:00:00Z',
          text: texts.orphan,
        },
        {
          type: 'MoonminingLaserFired',
          timestamp: '2026-10-17T01:00:00Z',
          text: started(1000, 7, arrival, decay),
        },
        {
          type: 'MoonminingExtractionCancelled',
          timestamp: '2026-10-19T00:00:00Z',
          text: started(2000, 9, 0, 0),
        },
        { type: 'Other', timestamp: '2026-10-19T00:00:00Z', text: 'x: 1' },
      ];
      const ours = notes.map((n): MoonNotification => ({
        type: n.type,
        timestamp: n.timestamp,
        payload: parseEveNotificationPayload(n.text),
      }));
      const theirs = notes.map((n) => ({
        type: n.type,
        timestamp: n.timestamp,
        payload: mirror.parseMoonPayload(n.text),
      }));
      const stored = [
        {
          structureId: 1000,
          moonId: 7,
          extractionStartTime: '2026-10-10T00:00:00.000Z',
          chunkArrivalTime: '2026-10-17T00:00:00.000Z',
        },
      ];
      expect(mirror.reconcileExtractions(esi, theirs, stored)).toEqual(
        reconcileExtractions(esi, ours, stored)
      );
      expect(mirror.reconcileExtractions(esi, [], [])).toEqual(reconcileExtractions(esi, [], []));
    });

    it('places observed rows on a system and a moon the same way', () => {
      const extractions: SyncExtraction[] = [
        {
          structureId: 1000,
          moonId: 7,
          extractionStartTime: '2026-10-10T00:00:00Z',
          chunkArrivalTime: '2026-10-17T00:00:00Z',
          naturalDecayTime: '2026-10-17T03:00:00Z',
        },
      ];
      const rows = ['2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20'].flatMap((date) =>
        [1000, 2000].map((structureId) => ({
          structureId,
          characterId: 5,
          recordedCorporationId: 1,
          typeId: 2,
          date,
          quantity: 3,
          cachedAt: '2026-10-18T00:00:00Z',
        }))
      );
      const systems = { 1000: 30000142 };
      expect(mirror.placeObservedRows(rows, extractions, systems)).toEqual(
        placeObservedRows(rows, extractions, systems)
      );
    });
  });

  it('stamps and re-stamps extractionIds the same way', () => {
    const pull = {
      structureId: 1000,
      moonId: 40,
      extractionStartTime: '2026-10-10T12:00:00.000Z',
      chunkArrivalTime: '2026-10-16T12:00:00.000Z',
      naturalDecayTime: '2026-10-16T15:00:00.000Z',
    };
    const cancelled = { ...pull, cancelledAt: '2026-10-16T13:00:00.000Z' };
    const fired = { ...pull, laserFiredAt: '2026-10-17T12:00:00.000Z' };
    const rows = ['2026-10-15', '2026-10-16', '2026-10-18', '2026-10-19', '2026-10-20'].map(
      (date, i) => ({
        structureId: 1000,
        characterId: 5,
        recordedCorporationId: 1,
        typeId: 2,
        date,
        quantity: 3,
        cachedAt: '2026-10-18T00:00:00Z',
        ...(i === 1 ? { extractionId: '1000_1' } : {}),
      })
    );
    const expiries: Record<string, number>[] = [{}, { '1000': 96 }, { '1000': 24 }];
    for (const hours of expiries) {
      for (const xs of [[pull], [cancelled], [fired], []]) {
        expect(mirror.stampExtractionIds(rows, xs, hours)).toEqual(
          stampExtractionIds(rows, xs, hours)
        );
        expect(mirror.restampPlan(rows, xs, hours)).toEqual(restampPlan(rows, xs, hours));
      }
    }
  });

  it('plans the same settlements', () => {
    const line = (chargeKey: string, date: string, tax: number) => ({
      kind: 'mined',
      chargeKey,
      date,
      tax,
      structureId: 1000,
    });
    const statements = [
      {
        id: 's1',
        minerId: 'solo:50',
        code: 'A',
        amount: 10_000_000,
        issuedAt: '2026-10-01T00:00:00Z',
        lines: [line('50:1:2026-09-30:1000', '2026-09-30', 10_000_000)],
      },
      {
        id: 's2',
        minerId: 'solo:50',
        code: 'B',
        amount: 4_000_000,
        issuedAt: '2026-10-08T00:00:00Z',
        lines: [line('50:1:2026-10-07:1000', '2026-10-07', 4_000_000)],
      },
      {
        id: 's3',
        minerId: 'solo:60',
        code: 'C',
        amount: 2_000_000,
        issuedAt: '2026-10-08T00:00:00Z',
        lines: [line('60:1:2026-10-07:1000', '2026-10-07', 2_000_000)],
      },
      {
        id: 's4',
        minerId: 'solo:70',
        code: 'D',
        amount: 9_000_000,
        issuedAt: '2026-10-08T00:00:00Z',
        lines: [line('70:1:2026-10-07:1000', '2026-10-07', 9_000_000)],
      },
    ];
    const payments = [
      { id: 'p1', minerId: 'solo:50', amount: 9_950_000, at: '2026-10-02T00:00:00Z' },
      {
        id: 'p2',
        minerId: 'solo:50',
        amount: 4_000_000,
        at: '2026-10-09T00:00:00Z',
        statementId: 's2',
      },
      {
        id: 'p3',
        minerId: 'solo:60',
        amount: 2_500_000,
        at: '2026-10-09T00:00:00Z',
        notTaxAmount: 1_000_000,
      },
      { id: 'p4', amount: 9_000_000, at: '2026-10-09T00:00:00Z' },
    ];
    const dismissals: Dismissal[] = [
      {
        id: 'd',
        scope: 'record',
        targetId: '70:1:2026-10-07:1000',
        by: 1,
        at: '2026-10-10T00:00:00Z',
        reason: 'r',
      },
    ];
    const extractions: SyncExtraction[] = [];
    for (const alreadyPaid of [new Set<string>(), new Set(['s1'])]) {
      const ours = planSettlements({
        statements: statements as unknown as Statement[],
        payments: payments.map((p) => ({ ...p, characterId: 1, source: 'donation' as const })),
        dismissals,
        miners: [],
        alreadyPaid,
        extractions,
      });
      const theirs = mirror.planSettlements({
        statements,
        payments,
        dismissals,
        alreadyPaid,
        extractions,
      });
      expect(theirs).toEqual(ours);
      expect(theirs.length).toBeGreaterThan(0);
    }
  });
  it('planSettlements ignores a donation before the start date in both copies (#4505)', () => {
    const statements = [
      {
        id: 's1',
        minerId: 'solo:50',
        amount: 10_000_000,
        issuedAt: '2026-10-01T00:00:00Z',
        lines: [],
      },
    ];
    for (const at of ['2026-05-31T23:59:59Z', '2026-06-01T00:00:00Z']) {
      const payments = [{ id: 'p1', minerId: 'solo:50', amount: 10_000_000, at }];
      const ours = planSettlements({
        statements: statements as unknown as Statement[],
        payments: payments.map((p) => ({ ...p, characterId: 1, source: 'donation' as const })),
        dismissals: [],
        miners: [],
        alreadyPaid: new Set(),
        startDate: '2026-06-01',
      });
      const theirs = mirror.planSettlements({
        statements,
        payments: payments.map((p) => ({ ...p, source: 'donation' as const })),
        dismissals: [],
        alreadyPaid: new Set(),
        extractions: [],
        startDate: '2026-06-01',
      });
      expect(theirs).toEqual(ours);
      expect(ours.length).toBe(at.startsWith('2026-06') ? 1 : 0);
    }
  });
  it("planSettlements settles a Statement an officer wrote off, in both copies, by the Miner's own (#4637)", () => {
    const statements = [
      {
        id: 's1',
        minerId: 'solo:50',
        amount: 10_000_000,
        issuedAt: '2026-10-01T00:00:00Z',
        lines: [],
      },
      {
        id: 's2',
        minerId: 'solo:60',
        amount: 10_000_000,
        issuedAt: '2026-10-01T00:00:00Z',
        lines: [],
      },
    ];
    const writeOffs = [
      { id: 'w1', minerId: 'solo:50', amount: 10_000_000, at: '2026-10-05T00:00:00Z', reason: 'r' },
      { id: 'w2', minerId: 'solo:60', amount: 1_000_000, at: '2026-10-05T00:00:00Z', reason: 'r' },
    ];
    const ours = planSettlements({
      statements: statements as unknown as Statement[],
      payments: [],
      dismissals: [],
      miners: [],
      alreadyPaid: new Set(),
      writeOffs,
    });
    const theirs = mirror.planSettlements({
      statements,
      payments: [],
      dismissals: [],
      alreadyPaid: new Set(),
      extractions: [],
      writeOffs,
    });
    expect(theirs).toEqual(ours);
    expect(ours).toEqual(['s1']);
  });
});
