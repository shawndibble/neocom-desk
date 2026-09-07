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
  toCalendarEventSources,
  toContractExpirySources,
  toIndustryJobSources,
  toOrderExpirySources,
  toPlanetExtractionSources,
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

  /**
   * ESI documents `importance` as an integer and uses it as a flag in
   * practice. Anything above zero is "important"; treating it as a scale would
   * invent a hierarchy the API does not promise.
   */
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

  /**
   * A paused queue has no `finish_date` at all — ESI drops it. There is no
   * clock to count down, and "not training" is a standing fault the
   * notification system already reports, so these are dropped rather than
   * turned into rows with nothing to sort on.
   */
  it('drops an entry from a paused queue', () => {
    expect(toSkillTrainingSources([entry({ finish_date: undefined })], name)).toEqual([]);
  });

  /** `queue_position` is the stable identity — `skill_id` repeats across levels. */
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

  it('names the product where there is one, and the blueprint otherwise', () => {
    expect(toIndustryJobSources([job()], name)[0].subject).toBe('Type 2454');
    expect(toIndustryJobSources([job({ product_type_id: undefined })], name)[0].subject).toBe(
      'Type 1000'
    );
  });

  /**
   * `ready` is the one that matters most — the job is finished and sitting
   * undelivered, which is exactly the thing a pilot forgets. Its `end_date` is
   * already past, so it arrives overdue and sorts to the top on its own.
   */
  it('keeps active and ready jobs and drops the finished ones', () => {
    const sources = toIndustryJobSources(
      [
        job({ job_id: 1, status: 'active' }),
        job({ job_id: 2, status: 'ready' }),
        job({ job_id: 3, status: 'delivered' }),
        job({ job_id: 4, status: 'cancelled' }),
      ],
      name
    );
    expect(sources.map((source) => source.id)).toEqual(['1', '2']);
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

  /** A factory or a storage pin has no program and no clock. */
  it('ignores pins that are not extractors', () => {
    expect(
      toPlanetExtractionSources([
        { planetName: 'Amarr VII', pins: [pin({ extractor_details: undefined })] },
      ])
    ).toEqual([]);
  });

  /** An extractor that has never been started carries no `expiry_time`. */
  it('ignores an extractor with no program running', () => {
    expect(
      toPlanetExtractionSources([{ planetName: 'Hek IV', pins: [pin({ expiry_time: undefined })] }])
    ).toEqual([]);
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

  it('uses the contract title when it has one', () => {
    expect(toContractExpirySources([contract({ title: 'Jita run' })])[0].subject).toBe('Jita run');
  });

  /** An untitled contract is the common case; its type is the only name it has. */
  it('falls back to the contract type when it is untitled', () => {
    expect(toContractExpirySources([contract()])[0].subject).toBe('courier');
  });

  it('keeps only contracts still open or being worked', () => {
    const sources = toContractExpirySources([
      contract({ contract_id: 1, status: 'outstanding' }),
      contract({ contract_id: 2, status: 'in_progress' }),
      contract({ contract_id: 3, status: 'finished' }),
      contract({ contract_id: 4, status: 'deleted' }),
    ]);
    expect(sources.map((source) => source.id)).toEqual(['1', '2']);
  });
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

  /**
   * The one genuinely derived deadline on the board: ESI gives an issue date
   * and a duration in whole days, and never an absolute expiry. Getting this
   * arithmetic wrong would be invisible — the row would simply sit in the
   * wrong place in an otherwise plausible list.
   */
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
