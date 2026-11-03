import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { suggestPayeeForSystem, systemsByPayee } from './suggestPayee';

const AINSAN = 30001;
const TALIDAL = 30002;

function payee(id: string, name: string, overrides: Partial<PayeeRecord> = {}): PayeeRecord {
  return { id, characterId: 1, name, defaultTaxPct: 5, updatedAt: 0, ...overrides };
}

function assigned(
  payeeId: string | undefined,
  date: string,
  solarSystemId = AINSAN,
  overrides: Partial<MiningTaxAssignmentRecord> = {}
): MiningTaxAssignmentRecord {
  return {
    id: `${payeeId}-${date}-${solarSystemId}`,
    characterId: 1,
    date,
    solarSystemId,
    payeeId,
    oreLines: [],
    taxPct: 5,
    estimatedValue: 0,
    taxOwed: 0,
    status: 'paid',
    updatedAt: 0,
    ...overrides,
  };
}

const starTail = payee('st', 'Star Tail Industries');
const ion = payee('ion', 'Ion Strider', { defaultTaxPct: 8 });
const bureau = payee('bu', 'Bureau of Unified Harvesting');
const guns = payee('gu', 'Guns-R-Us Holdings');
const payees = [starTail, ion, bureau, guns];

describe('suggestPayeeForSystem', () => {
  it('suggests the Payee last used in the system, by mined date', () => {
    const result = suggestPayeeForSystem(
      [
        assigned('bu', '2026-09-27'),
        assigned('ion', '2026-09-30'),
        assigned('st', '2026-09-12'),
        assigned('st', '2026-09-10'),
      ],
      payees,
      AINSAN,
      1
    );
    expect(result.suggested?.id).toBe('ion');
    expect(result.fromHistory).toBe(true);
  });

  it('ranks the rest by how often they were used in that system, then by name', () => {
    const result = suggestPayeeForSystem(
      [
        assigned('ion', '2026-09-30'),
        assigned('st', '2026-09-12'),
        assigned('st', '2026-09-10'),
        assigned('bu', '2026-09-27'),
        assigned('gu', '2026-09-08', TALIDAL),
      ],
      payees,
      AINSAN,
      1
    );
    expect(result.ranked.map((p) => p.id)).toEqual(['ion', 'st', 'bu', 'gu']);
  });

  it('ignores dismissals and other systems when picking the suggestion', () => {
    const result = suggestPayeeForSystem(
      [
        assigned(undefined, '2026-10-01', AINSAN, { status: 'dismissed' }),
        assigned('gu', '2026-10-02', TALIDAL),
        assigned('st', '2026-09-01'),
      ],
      payees,
      AINSAN,
      1
    );
    expect(result.suggested?.id).toBe('st');
  });

  it('skips a Payee that no longer exists', () => {
    const result = suggestPayeeForSystem(
      [assigned('gone', '2026-10-02'), assigned('bu', '2026-09-01')],
      payees,
      AINSAN,
      1
    );
    expect(result.suggested?.id).toBe('bu');
  });

  const defaultFor = (systemId: number, characterId = 1) =>
    payee('pl', 'Plenitude Highsec Police', {
      characterId,
      defaultSystems: [{ systemId, from: '2026-09-01' }],
    });

  it('falls back to the system’s Default Payee when nothing was assigned there yet', () => {
    const result = suggestPayeeForSystem([], [...payees, defaultFor(TALIDAL)], TALIDAL, 1);
    expect(result.suggested?.id).toBe('pl');
    expect(result.fromHistory).toBe(false);
    expect(result.ranked[0].id).toBe('pl');
  });

  it('puts the Default Payee last: history in the system comes first', () => {
    const result = suggestPayeeForSystem(
      [assigned('st', '2026-09-01', TALIDAL)],
      [...payees, defaultFor(TALIDAL)],
      TALIDAL,
      1
    );
    expect(result.suggested?.id).toBe('st');
    expect(result.fromHistory).toBe(true);
  });

  it('ignores another Character’s Default Payee', () => {
    const result = suggestPayeeForSystem([], [...payees, defaultFor(TALIDAL, 2)], TALIDAL, 1);
    expect(result.suggested).toBeUndefined();
  });

  it('suggests nothing for a system with no history and no Default Payee', () => {
    const result = suggestPayeeForSystem([assigned('st', '2026-09-01')], payees, TALIDAL, 1);
    expect(result.suggested).toBeUndefined();
    expect(result.ranked.map((p) => p.name)).toEqual([
      'Bureau of Unified Harvesting',
      'Guns-R-Us Holdings',
      'Ion Strider',
      'Star Tail Industries',
    ]);
  });
});

describe('systemsByPayee', () => {
  it('lists the systems each Payee has been used in, ignoring dismissals', () => {
    const systems = systemsByPayee(
      [
        assigned('st', '2026-09-01'),
        assigned('st', '2026-09-02', TALIDAL),
        assigned(undefined, '2026-09-03', 30009, { status: 'dismissed' }),
      ],
      payees
    );
    expect([...(systems.get('st') ?? [])].sort()).toEqual([AINSAN, TALIDAL]);
    expect(systems.size).toBe(1);
  });
});
