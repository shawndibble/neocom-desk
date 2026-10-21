/**
 * A ready book for the settings dialog's test and story: two refineries of a moon owner whose
 * ledger-only rows never carry a moon, and one per-refinery rate already set (#4621).
 */
import { buildBookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { BookData, BookSettings, OfficerVerdict } from '../taxBook/bookClient';
import type { BookContextValue } from './bookContextValue';

const BOOK = 98000000;
export const OWNER = 98000001;
const ORE = 45490;
export const REFINERY_A = 1035000000001;
export const REFINERY_B = 1035000000002;

const REFINERY_NAMES: Record<number, string> = {
  [REFINERY_A]: 'Efa - Ashfall Tatara',
  [REFINERY_B]: 'Efa - Ashfall Athanor',
};

const rates: TaxRate[] = [
  { scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' },
  { scope: 'structure', structureId: REFINERY_A, pct: 6, effectiveFrom: '2026-10-05' },
  { scope: 'feeder', feederId: OWNER, pct: 8, effectiveFrom: '2026-10-05' },
];

/** A moon owner that left: no rate can be set for it any more. */
export const LEFT_OWNER = 98000003;

export function bookSettingsValue(): Omit<BookContextValue, 'edit' | 'canEdit'> {
  const input: BookViewInput = {
    corporationId: BOOK,
    now: '2026-10-20T12:00:00Z',
    startDate: '2026-10-01',
    graceHours: 6,
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    rates,
    entries: [REFINERY_A, REFINERY_B].map((structureId) => ({
      characterId: 90000001,
      recordedCorporationId: OWNER,
      sourceCorporationId: OWNER,
      structureId,
      date: '2026-10-06',
      oreLines: [{ typeId: ORE, quantity: 1000 }],
    })),
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    paidStatementIds: new Set(),
    pricesOn: () => ({ prices: new Map([[ORE, 100]]), sources: new Map() }),
  };
  const verdict = {
    corporationId: BOOK,
    isCeo: false,
    isDirector: false,
    isStationManager: false,
    canView: true,
    canEdit: true,
    bookActive: true,
  } as OfficerVerdict;
  const settings = {
    corporationId: BOOK,
    startDate: '2026-10-01',
    graceHours: 6,
    hubId: 'jita',
    oreForm: 'compressed',
    minimumStatement: 0,
    overdueDays: 14,
    divisions: [1],
    cadence: { kind: 'monthly' },
    structureExpiryHours: {},
    dismissApprovalAboveIsk: null,
    rates,
  } as unknown as BookSettings;
  return {
    characterId: 7,
    corporationId: BOOK,
    view: buildBookView(input),
    names: {
      character: (id) => `Pilot ${id}`,
      corporation: (id) => `Corp ${id}`,
      refinery: (id) => REFINERY_NAMES[id] ?? `Refinery ${id}`,
      moon: (id) => `Moon ${id}`,
      ore: () => 'Zeolites',
    },
    settings,
    data: {
      feeders: [
        { corporationId: OWNER, status: 'active' },
        { corporationId: LEFT_OWNER, status: 'left' },
      ],
      state: { extractions: [] },
    } as unknown as BookData,
    verdict,
    reload: () => undefined,
  };
}
