import { DEFAULT_NOTICE_RULES } from '@/engine/corpTaxBook/notices';
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

export const LEFT_OWNER = 98000003;

export function bookSettingsValue(
  roles: Partial<OfficerVerdict> = {},
  settingsOverride: Partial<BookSettings> = {}
): Omit<BookContextValue, 'edit' | 'canEdit'> {
  const input: BookViewInput = {
    corporationId: BOOK,
    now: '2026-10-20T12:00:00Z',
    startDate: '2026-10-01',
    graceHours: 6,
    overdueDays: 14,
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
    notices: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
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
    ...roles,
  } as OfficerVerdict;
  const settings = {
    corporationId: BOOK,
    startDate: '2026-10-01',
    graceHours: 6,
    hubId: 'jita',
    oreForm: 'compressed',
    overdueDays: 14,
    divisions: [1],
    structureExpiryHours: {},
    dismissApprovalAboveIsk: null,
    rates,
    noticeRules: DEFAULT_NOTICE_RULES,
    dayTolerancePct: 0.5,
    ...settingsOverride,
  } as unknown as BookSettings;
  return {
    characterId: 7,
    corporationId: BOOK,
    view: buildBookView(input),
    names: {
      character: (id) => `Pilot ${id}`,
      corporation: (id) => `Corp ${id}`,
      refinery: (id) => REFINERY_NAMES[id] ?? `Refinery ${id}`,
      ownerRefinery: (id) => REFINERY_NAMES[id] ?? `Refinery ${id}`,
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
      parts: new Set(['core', 'observed', 'ledger', 'answers']),
    } as unknown as BookData,
    verdict,
    reload: () => undefined,
  };
}
