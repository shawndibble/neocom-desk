import { describe, it, expect } from 'vitest';
import {
  jobTypeIds,
  structureName,
  structureStateLabel,
  toBoardExtractions,
  toBoardJobs,
  toBoardStructures,
  toVitalsJournal,
} from './boardSources';
import type { CorporationIndustryJob, CorporationStructure } from '@/esi/endpoints';

const STRUCTURE: CorporationStructure = {
  structure_id: 1000000000001,
  corporation_id: 98000001,
  system_id: 30002505,
  type_id: 35832,
  profile_id: 1,
  name: 'Nakugard - Home',
  fuel_expires: '2026-09-10T12:00:00Z',
};

describe('structureName', () => {
  /**
   * AC4: corp structures carry their own `name`, so there is no bulk-resolution
   * dance here — that is only needed for character ids.
   */
  it('uses the endpoint’s own name field', () => {
    expect(structureName(STRUCTURE)).toBe('Nakugard - Home');
  });

  it('falls back to the id, which is at least searchable in the client', () => {
    expect(structureName({ structure_id: 42 })).toBe('#42');
  });
});

describe('structureStateLabel', () => {
  it('unwraps ESI’s own spelling rather than translating it', () => {
    expect(structureStateLabel('armor_reinforce')).toBe('armor reinforce');
  });

  /**
   * The reason this is not a lookup table: CCP extends the state enum without
   * notice, and a table would render tomorrow's state as a blank in front of
   * the one manager whose structure is in it.
   */
  it('says something true about a state this app has never heard of', () => {
    expect(structureStateLabel('quantum_vulnerable')).toBe('quantum vulnerable');
  });
});

describe('toBoardStructures', () => {
  it('parses ESI timestamps into the epoch ms the engine ranks on', () => {
    const [source] = toBoardStructures([STRUCTURE]);
    expect(source.fuelExpiresMs).toBe(Date.parse('2026-09-10T12:00:00Z'));
    expect(source.name).toBe('Nakugard - Home');
  });

  /**
   * The one field whose absence carries meaning: ESI drops `fuel_expires` once
   * the structure has run dry, and the engine reads `null` as "already past",
   * not "no clock".
   */
  it('passes an absent fuel_expires through as null', () => {
    const [source] = toBoardStructures([{ ...STRUCTURE, fuel_expires: undefined }]);
    expect(source.fuelExpiresMs).toBeNull();
  });

  /**
   * A NaN deadline would sort unpredictably and compare false against every
   * threshold, so it must never reach the engine.
   */
  it('turns an unparseable timestamp into null rather than NaN', () => {
    const [source] = toBoardStructures([{ ...STRUCTURE, state_timer_end: 'not a date' }]);
    expect(source.stateTimerEndMs).toBeNull();
  });

  it('defaults an absent services array to empty rather than throwing', () => {
    expect(toBoardStructures([STRUCTURE])[0].services).toEqual([]);
  });

  it('carries services through with their states intact', () => {
    const [source] = toBoardStructures([
      { ...STRUCTURE, services: [{ name: 'Clone Bay', state: 'offline' }] },
    ]);
    expect(source.services).toEqual([{ name: 'Clone Bay', state: 'offline' }]);
  });
});

describe('toBoardExtractions', () => {
  const extraction = {
    structure_id: 1000000000001,
    moon_id: 40000001,
    extraction_start_time: '2026-09-01T00:00:00Z',
    chunk_arrival_time: '2026-09-08T00:00:00Z',
    natural_decay_time: '2026-09-10T00:00:00Z',
  };

  it('names the drill after the refinery it sits on', () => {
    const [source] = toBoardExtractions([extraction], new Map([[1000000000001, 'Athanor']]));
    expect(source.subject).toBe('Athanor');
    expect(source.chunkArrivalMs).toBe(Date.parse('2026-09-08T00:00:00Z'));
  });

  /**
   * The extraction endpoint returns ids and no names at all, so the refinery's
   * name is borrowed from the structure list. That list can be missing, and the
   * moon id says more than a blank row.
   */
  it('falls back to the moon id when the structure list has no name for it', () => {
    const [source] = toBoardExtractions([extraction], new Map());
    expect(source.subject).toBe('Moon 40000001');
  });

  it('drops an extraction whose clocks do not parse rather than inventing one', () => {
    expect(toBoardExtractions([{ ...extraction, chunk_arrival_time: '' }], new Map())).toEqual([]);
  });
});

describe('toBoardJobs', () => {
  const job: CorporationIndustryJob = {
    job_id: 500,
    installer_id: 90000001,
    activity_id: 1,
    blueprint_id: 1,
    blueprint_type_id: 1001,
    blueprint_location_id: 1,
    output_location_id: 1,
    facility_id: 1,
    location_id: 1,
    runs: 10,
    start_date: '2026-09-01T00:00:00Z',
    end_date: '2026-09-02T00:00:00Z',
    status: 'ready',
    product_type_id: 2001,
  };

  it('names a job after what it makes', () => {
    const [source] = toBoardJobs([job], new Map([[2001, 'Hobgoblin II']]));
    expect(source.subject).toBe('Hobgoblin II');
    expect(source.status).toBe('ready');
  });

  /** Research and copying jobs have no product — the blueprint is the subject. */
  it('falls back to the blueprint for an activity with no product', () => {
    const [source] = toBoardJobs(
      [{ ...job, activity_id: 5, product_type_id: undefined }],
      new Map([[1001, 'Hobgoblin II Blueprint']])
    );
    expect(source.subject).toBe('Hobgoblin II Blueprint');
  });

  it('falls back to the job id when nothing resolved at all', () => {
    expect(toBoardJobs([job], new Map())[0].subject).toBe('#500');
  });

  /**
   * Which statuses count is a ranking decision and lives in the engine — the
   * adapter's job is shape, so it hands every job over.
   */
  it('passes non-ready jobs through, leaving the filter to the engine', () => {
    expect(toBoardJobs([{ ...job, status: 'active' }], new Map())).toHaveLength(1);
  });

  it('collects the type ids a job needs names for, without duplicates', () => {
    expect(jobTypeIds([job, job]).sort()).toEqual([1001, 2001]);
    expect(jobTypeIds([{ ...job, product_type_id: undefined }])).toEqual([1001]);
  });
});

describe('toVitalsJournal', () => {
  it('reduces a journal to instants and amounts', () => {
    expect(
      toVitalsJournal([
        {
          id: 1,
          date: '2026-09-01T00:00:00Z',
          ref_type: 'office_rental_fee',
          description: 'rent',
          amount: -500,
        },
      ])
    ).toEqual([{ atMs: Date.parse('2026-09-01T00:00:00Z'), amount: -500 }]);
  });

  /** A line with no amount moved no ISK, so it belongs in no rate. */
  it('drops a line carrying no amount', () => {
    expect(
      toVitalsJournal([{ id: 1, date: '2026-09-01T00:00:00Z', ref_type: 'x', description: 'x' }])
    ).toEqual([]);
  });
});

// The wallet-division join is `divisions.test.ts` (#298); the board reads that
// module rather than a second one of its own.
