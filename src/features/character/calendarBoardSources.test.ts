import { HOUR_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import type {
  CalendarEventSummary,
  Contract,
  IndustryJob,
  MarketOrder,
  PlanetPin,
  SkillQueueEntry,
} from '@/esi/endpoints';
import {
  toAcceleratorSources,
  toCalendarEventSources,
  toContractExpirySources,
  toIndustryJobSources,
  toMercenaryDenSources,
  toMoonChunkSources,
  toOrderExpirySources,
  toPlanetExtractionSources,
  toSkyhookRaidSources,
  toSkillTrainingSources,
} from './calendarBoardSources';

const ISO = (s: string) => s;
const name = (id: number) => `Type ${id}`;

describe('toCalendarEventSources', () => {
  const event = (overrides: Partial<CalendarEventSummary> = {}): CalendarEventSummary => ({
    event_id: 1,
    event_date: ISO('2026-09-07T21:00:00Z'),
    title: 'Alliance CTA',
    importance: 0,
    event_response: 'not_responded',
    ...overrides,
  });

  it('carries the RSVP state through and reduces importance to a flag', () => {
    const [source] = toCalendarEventSources([event({ importance: 1 })]);
    expect(source).toMatchObject({
      id: '1',
      subject: 'Alliance CTA',
      response: 'not_responded',
      important: true,
    });
    expect(source.deadlineMs).toBe(Date.parse('2026-09-07T21:00:00Z'));
  });

  it('treats any non-zero importance as important', () => {
    expect(toCalendarEventSources([event({ importance: 0 })])[0].important).toBe(false);
    expect(toCalendarEventSources([event({ importance: 5 })])[0].important).toBe(true);
  });

  it('drops an event whose date will not parse', () => {
    expect(toCalendarEventSources([event({ event_date: 'not a date' })])).toEqual([]);
  });
});

describe('toSkillTrainingSources', () => {
  const entry = (overrides: Partial<SkillQueueEntry> = {}): SkillQueueEntry => ({
    skill_id: 3336,
    queue_position: 0,
    finished_level: 5,
    start_date: ISO('2026-09-01T00:00:00Z'),
    finish_date: ISO('2026-09-08T21:00:00Z'),
    ...overrides,
  });

  it('names the skill and the level it will finish', () => {
    const [source] = toSkillTrainingSources([entry()], name);
    expect(source).toMatchObject({ id: '0', subject: 'Type 3336 V' });
    expect(source.deadlineMs).toBe(Date.parse('2026-09-08T21:00:00Z'));
  });

  it('drops an entry from a paused queue', () => {
    expect(toSkillTrainingSources([entry({ finish_date: undefined })], name)).toEqual([]);
  });

  it('keys on queue position so two levels of one skill do not collide', () => {
    const sources = toSkillTrainingSources(
      [
        entry({ queue_position: 0, finished_level: 4 }),
        entry({ queue_position: 1, finished_level: 5 }),
      ],
      name
    );
    expect(sources.map((source) => source.id)).toEqual(['0', '1']);
  });
});

describe('toIndustryJobSources', () => {
  const job = (overrides: Partial<IndustryJob> = {}): IndustryJob => ({
    job_id: 42,
    activity_id: 1,
    blueprint_type_id: 1000,
    facility_id: 60003760,
    station_id: 60003760,
    runs: 250,
    start_date: ISO('2026-09-01T00:00:00Z'),
    end_date: ISO('2026-09-07T22:00:00Z'),
    status: 'active',
    product_type_id: 2454,
    ...overrides,
  });

  const BEFORE_END = Date.parse('2026-09-01T00:00:00Z');
  const AFTER_END = Date.parse('2026-09-07T22:00:01Z');

  it('names the product where there is one, and the blueprint otherwise', () => {
    expect(toIndustryJobSources([job()], name, BEFORE_END)[0].subject).toBe('Type 2454');
    expect(
      toIndustryJobSources([job({ product_type_id: undefined })], name, BEFORE_END)[0].subject
    ).toBe('Type 1000');
  });

  it('keeps active and ready jobs and drops the finished ones', () => {
    const sources = toIndustryJobSources(
      [
        job({ job_id: 1, status: 'active' }),
        job({ job_id: 2, status: 'ready' }),
        job({ job_id: 3, status: 'delivered' }),
        job({ job_id: 4, status: 'cancelled' }),
      ],
      name,
      BEFORE_END
    );
    expect(sources.map((source) => source.id)).toEqual(['1', '2']);
  });

  it('clears the detail once the deadline has passed, regardless of status', () => {
    expect(toIndustryJobSources([job({ status: 'ready' })], name, AFTER_END)[0].detail).toBe('');
    expect(toIndustryJobSources([job({ status: 'active' })], name, AFTER_END)[0].detail).toBe('');
  });

  it('keeps the status as detail while the job is still running', () => {
    expect(toIndustryJobSources([job({ status: 'active' })], name, BEFORE_END)[0].detail).toBe(
      'active'
    );
  });
});

describe('toPlanetExtractionSources', () => {
  const pin = (overrides: Partial<PlanetPin> = {}): PlanetPin => ({
    pin_id: 7,
    type_id: 2848,
    latitude: 0,
    longitude: 0,
    expiry_time: ISO('2026-09-08T02:00:00Z'),
    extractor_details: { heads: [], qty_per_cycle: 1000 },
    ...overrides,
  });

  it('takes one program per extractor pin, named for its planet', () => {
    const [source] = toPlanetExtractionSources([{ planetName: 'Pochven IV', pins: [pin()] }]);
    expect(source).toMatchObject({ id: '7', subject: 'Pochven IV' });
    expect(source.deadlineMs).toBe(Date.parse('2026-09-08T02:00:00Z'));
  });

  it('ignores pins that are not extractors', () => {
    expect(
      toPlanetExtractionSources([
        { planetName: 'Amarr VII', pins: [pin({ extractor_details: undefined })] },
      ])
    ).toEqual([]);
  });

  it('ignores an extractor with no program running', () => {
    expect(
      toPlanetExtractionSources([{ planetName: 'Hek IV', pins: [pin({ expiry_time: undefined })] }])
    ).toEqual([]);
  });
});

describe('toMoonChunkSources', () => {
  const ARRIVES = Date.parse('2026-09-08T02:00:00Z');
  const DECAYS = Date.parse('2026-09-08T14:00:00Z');
  const drill = (overrides = {}) => ({
    structureId: 1001,
    subject: 'Nakugard - Home',
    chunkArrivalMs: ARRIVES,
    naturalDecayMs: DECAYS,
    ...overrides,
  });

  it('counts down to the arrival while the chunk is still coming', () => {
    const [source] = toMoonChunkSources([drill()], ARRIVES - 1);
    expect(source).toMatchObject({ id: '1001', subject: 'Nakugard - Home', detail: 'arrival' });
    expect(source.deadlineMs).toBe(ARRIVES);
  });

  it('counts down to the natural decay once the chunk has arrived', () => {
    const [source] = toMoonChunkSources([drill()], ARRIVES);
    expect(source).toMatchObject({ detail: 'decay' });
    expect(source.deadlineMs).toBe(DECAYS);
  });

  it('drops a chunk past its natural decay', () => {
    expect(toMoonChunkSources([drill()], DECAYS)).toEqual([]);
  });

  it('keeps drills on different refineries distinct', () => {
    const sources = toMoonChunkSources([drill(), drill({ structureId: 1002 })], ARRIVES - 1);
    expect(sources.map((source) => source.id)).toEqual(['1001', '1002']);
  });
});

describe('toSkyhookRaidSources', () => {
  const NOW = Date.parse('2026-10-23T12:00:00Z');
  const raid = (overrides = {}) => ({
    id: 5,
    subject: 'X-7OMU IV',
    systemId: 30000001,
    systemName: 'X-7OMU',
    windowStartMs: NOW + 2 * HOUR_MS,
    windowEndMs: NOW + 4 * HOUR_MS,
    unsecuredUnits: 400,
    securedUnits: 800,
    ...overrides,
  });

  it('counts down to the window opening while it is still ahead', () => {
    const [source] = toSkyhookRaidSources([raid()], NOW);
    expect(source).toMatchObject({ id: '5', subject: 'X-7OMU IV', detail: 'upcoming' });
    expect(source.deadlineMs).toBe(NOW + 2 * HOUR_MS);
  });

  it('counts down to the window closing once it is open', () => {
    const [source] = toSkyhookRaidSources([raid()], NOW + 3 * HOUR_MS);
    expect(source).toMatchObject({ detail: 'open' });
    expect(source.deadlineMs).toBe(NOW + 4 * HOUR_MS);
  });

  it('drops a closed window and a skyhook with no readable window', () => {
    expect(toSkyhookRaidSources([raid()], NOW + 5 * HOUR_MS)).toEqual([]);
    expect(toSkyhookRaidSources([raid({ windowStartMs: null })], NOW)).toEqual([]);
  });
});

describe('toContractExpirySources', () => {
  const contract = (overrides: Partial<Contract> = {}): Contract => ({
    contract_id: 99,
    issuer_id: 1,
    issuer_corporation_id: 2,
    assignee_id: 3,
    acceptor_id: 0,
    type: 'courier',
    status: 'outstanding',
    for_corporation: false,
    availability: 'personal',
    date_issued: ISO('2026-09-01T00:00:00Z'),
    date_expired: ISO('2026-09-09T15:00:00Z'),
    ...overrides,
  });

  const typeLabel = (type: Contract['type']) => `LABEL:${type}`;
  const noRoute = () => undefined;

  it('uses the contract title when it has one, even for an untitled-courier-shaped route', () => {
    expect(
      toContractExpirySources(
        [contract({ title: 'Jita run' })],
        typeLabel,
        () => 'should not be used'
      )[0].subject
    ).toBe('Jita run');
  });

  it('falls back to the translated type label when untitled and no route resolved', () => {
    expect(toContractExpirySources([contract()], typeLabel, noRoute)[0].subject).toBe(
      'LABEL:courier'
    );
  });

  it('prefers the resolved route over the type label for an untitled courier', () => {
    const route = 'Jita IV - Moon 4 → Amarr VIII';
    expect(toContractExpirySources([contract()], typeLabel, () => route)[0].subject).toBe(route);
  });

  it('keeps only contracts still open or being worked', () => {
    const sources = toContractExpirySources(
      [
        contract({ contract_id: 1, status: 'outstanding' }),
        contract({ contract_id: 2, status: 'in_progress' }),
        contract({ contract_id: 3, status: 'finished' }),
        contract({ contract_id: 4, status: 'deleted' }),
      ],
      typeLabel,
      noRoute
    );
    expect(sources.map((source) => source.id)).toEqual(['1', '2']);
  });

  const EXPIRY_MS = Date.parse('2026-09-09T15:00:00Z');

  it('counts an accepted courier down to acceptance plus the allowed days', () => {
    const [source] = toContractExpirySources(
      [
        contract({
          status: 'in_progress',
          date_accepted: ISO('2026-09-01T06:00:00Z'),
          days_to_complete: 3,
        }),
      ],
      typeLabel,
      noRoute
    );
    expect(source.deadlineMs).toBe(Date.parse('2026-09-04T06:00:00Z'));
    expect(source.deadlineMs).toBeLessThan(EXPIRY_MS);
  });

  it('lets an accepted courier run past the offer expiry', () => {
    const [source] = toContractExpirySources(
      [
        contract({
          status: 'in_progress',
          date_accepted: ISO('2026-09-09T12:00:00Z'),
          days_to_complete: 3,
        }),
      ],
      typeLabel,
      noRoute
    );
    expect(source.deadlineMs).toBe(Date.parse('2026-09-12T12:00:00Z'));
    expect(source.deadlineMs).toBeGreaterThan(EXPIRY_MS);
  });

  it('uses the offer expiry for a courier nobody has accepted yet', () => {
    const [source] = toContractExpirySources(
      [contract({ status: 'outstanding', days_to_complete: 3 })],
      typeLabel,
      noRoute
    );
    expect(source.deadlineMs).toBe(EXPIRY_MS);
  });

  it('uses the offer expiry for an accepted non-courier contract', () => {
    const [source] = toContractExpirySources(
      [
        contract({
          type: 'item_exchange',
          status: 'in_progress',
          date_accepted: ISO('2026-09-01T06:00:00Z'),
          days_to_complete: 3,
        }),
      ],
      typeLabel,
      noRoute
    );
    expect(source.deadlineMs).toBe(EXPIRY_MS);
  });

  it.each([
    ['no acceptance time', { days_to_complete: 3 }],
    ['no allowed days', { date_accepted: ISO('2026-09-01T06:00:00Z') }],
    ['an unparseable acceptance time', { date_accepted: 'soon', days_to_complete: 3 }],
    ['no completion window', { date_accepted: ISO('2026-09-01T06:00:00Z'), days_to_complete: 0 }],
  ])(
    'falls back to the offer expiry for an accepted courier with %s',
    (_label, overrides: Partial<Contract>) => {
      const [source] = toContractExpirySources(
        [contract({ status: 'in_progress', ...overrides })],
        typeLabel,
        noRoute
      );
      expect(source.deadlineMs).toBe(EXPIRY_MS);
    }
  );
});

describe('toOrderExpirySources', () => {
  const order = (overrides: Partial<MarketOrder> = {}): MarketOrder => ({
    order_id: 5,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    is_corporation: false,
    price: 5.5,
    volume_remain: 2_400_000,
    volume_total: 3_000_000,
    issued: ISO('2026-09-01T12:00:00Z'),
    duration: 90,
    range: 'station',
    ...overrides,
  });

  it('computes expiry as the issue date plus the duration in days', () => {
    const [source] = toOrderExpirySources([order()], name);
    expect(source.deadlineMs).toBe(Date.parse('2026-09-01T12:00:00Z') + 90 * 86_400_000);
  });

  it('distinguishes a buy order from a sell order in the detail', () => {
    expect(toOrderExpirySources([order({ is_buy_order: true })], name)[0].detail).toContain('buy');
    expect(toOrderExpirySources([order()], name)[0].detail).toContain('sell');
  });

  it('drops an order whose issue date will not parse', () => {
    expect(toOrderExpirySources([order({ issued: '' })], name)).toEqual([]);
  });
});

describe('toMercenaryDenSources', () => {
  const NOW = Date.parse('2026-10-23T10:00:00Z');
  const den = (overrides = {}) => ({
    id: 10,
    planetId: 40000001,
    planetName: 'Efa VII' as string | null,
    state: 'running' as const,
    reinforcedUntilMs: null as number | null,
    anarchyLevel: 1,
    operations: [] as { state: 'available' | 'started' | 'done'; expiresMs: number | null }[],
    ...overrides,
  });

  it('gives a reinforced den its reinforcement end', () => {
    expect(
      toMercenaryDenSources(
        [den({ state: 'reinforced', reinforcedUntilMs: NOW + 14 * HOUR_MS })],
        NOW
      )
    ).toEqual([
      {
        id: '10:reinforcement',
        subject: 'Efa VII',
        detail: 'reinforcement',
        deadlineMs: NOW + 14 * HOUR_MS,
      },
    ]);
  });

  it('gives each open operation its expiry, and skips done or lapsed ones', () => {
    const sources = toMercenaryDenSources(
      [
        den({
          operations: [
            { state: 'available', expiresMs: NOW + 9 * HOUR_MS },
            { state: 'started', expiresMs: NOW + 2 * HOUR_MS },
            { state: 'done', expiresMs: NOW + 5 * HOUR_MS },
            { state: 'available', expiresMs: NOW - HOUR_MS },
          ],
        }),
      ],
      NOW
    );
    expect(sources.map((s) => [s.detail, s.deadlineMs])).toEqual([
      ['operation', NOW + 2 * HOUR_MS],
      ['operation', NOW + 9 * HOUR_MS],
    ]);
    expect(new Set(sources.map((s) => s.id)).size).toBe(2);
  });

  it('drops a lapsed reinforcement timer from a stale read', () => {
    expect(
      toMercenaryDenSources([den({ state: 'reinforced', reinforcedUntilMs: NOW - HOUR_MS })], NOW)
    ).toEqual([]);
  });

  it('names an unnamed planet by its id', () => {
    const [source] = toMercenaryDenSources(
      [den({ planetName: null, state: 'reinforced', reinforcedUntilMs: NOW + HOUR_MS })],
      NOW
    );
    expect(source.subject).toBe('#40000001');
  });
});

describe('toAcceleratorSources', () => {
  const NOW = 1_000_000;
  const subject = (bonus: number) => `Cerebral accelerator +${bonus}`;

  it('is one clock at the typed-in expiry, named by its bonus', () => {
    expect(
      toAcceleratorSources({ characterId: 7, bonus: 12, expiresAt: NOW + 5_000 }, NOW, subject)
    ).toEqual([
      { id: '7', subject: 'Cerebral accelerator +12', detail: '', deadlineMs: NOW + 5_000 },
    ]);
  });

  it('is nothing with none typed in, or once it has run out', () => {
    expect(toAcceleratorSources(undefined, NOW, subject)).toEqual([]);
    expect(
      toAcceleratorSources({ characterId: 7, bonus: 12, expiresAt: NOW }, NOW, subject)
    ).toEqual([]);
  });
});
