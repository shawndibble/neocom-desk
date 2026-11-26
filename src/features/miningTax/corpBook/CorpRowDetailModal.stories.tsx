import type { Meta, StoryObj } from '@storybook/react-vite';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { DisplayRow } from '../groupRows';
import type { ClosedDayPlan } from '@/engine/corpTaxBook/closedDayFix';
import { ClosedDayConflictNotice } from './ClosedDayConflict';
import { ConflictNotice } from './ConflictNotice';
import { CorpRowDetailModal } from './CorpRowDetailModal';
import type { CorpRowInfo } from './corpRows';

const ZEO = 45490;
const CORP_NAME = 'Brass Meridian Logistics';

const base: BookRowView = {
  id: '98000001:1:1000:2026-10-28',
  corporationId: 98000001,
  corpName: CORP_NAME,
  characterId: 1,
  date: '2026-10-28',
  solarSystemId: 30003838,
  state: 'billed',
  oreLines: [{ typeId: ZEO, quantity: 43_050 }],
  unitPrices: { [ZEO]: 148.2 },
  priceSources: { [ZEO]: 'saved' },
  taxPct: 5,
  rateScope: 'corp',
  rateEffectiveFrom: '2026-10-01',
  estimatedValue: 6_380_010,
  taxOwed: 319_000,
  billed: 319_000,
  hubId: 'jita',
  oreForm: 'compressed',
};

const PAID_DAY: ClosedDayPlan = {
  characterId: 1,
  date: '2026-10-28',
  solarSystemId: 30003838,
  state: 'conflict',
  books: [
    {
      corporationId: 98000001,
      minerId: 'solo:1',
      ownPayeeIds: ['own'],
      share: [{ typeId: ZEO, quantity: 43_050 }],
      taxPct: 5,
      unitPrices: { [ZEO]: 148.2 },
      oreForm: 'compressed',
      moneyApplied: true,
    },
  ],
  fixes: [
    {
      assignmentId: 'c',
      payeeId: 'own',
      corporationId: 98000001,
      before: { oreLines: [{ typeId: ZEO, quantity: 30_000 }], taxPct: 5 },
      after: { oreLines: [{ typeId: ZEO, quantity: 43_050 }], taxPct: 5 },
      releasedTypeIds: [ZEO],
    },
    {
      assignmentId: 'x',
      payeeId: 'ashfall',
      before: { oreLines: [{ typeId: ZEO, quantity: 20_000 }], taxPct: 8 },
      after: { oreLines: [{ typeId: ZEO, quantity: 6_950 }], taxPct: 8 },
      releasedTypeIds: [ZEO],
    },
  ],
  blockers: [{ kind: 'bookPayment', corporationId: 98000001 }],
};

function Story({
  view,
  conflict = false,
  twoBooks = false,
  closed = false,
}: {
  view: BookRowView;
  conflict?: boolean;
  twoBooks?: boolean;
  closed?: boolean;
}) {
  const corp: Extract<CorpRowInfo, { kind: 'row' }> = { kind: 'row', view, corpName: CORP_NAME };
  const dr = {
    key: view.id,
    status: 'outstanding',
    assignment: null,
    row: { characterName: 'Kestrel Vane' },
    corp,
  } as unknown as DisplayRow;
  return (
    <>
      <div className="min-h-screen" />
      <CorpRowDetailModal
        open
        onClose={() => {}}
        dr={dr}
        corp={corp}
        book={undefined}
        systemName="Talidal"
        systemSecurity={0.5}
        typeNames={new Map([[ZEO, 'Compressed Zeolites']])}
        notice={
          closed ? (
            <ClosedDayConflictNotice
              plan={PAID_DAY}
              names={{
                payee: (id) => (id === 'own' ? CORP_NAME : 'Ashfall Mining'),
                corp: () => CORP_NAME,
                typeNames: new Map([[ZEO, 'Compressed Zeolites']]),
              }}
              onFix={() => {}}
              onResolve={() => {}}
            />
          ) : conflict ? (
            <ConflictNotice
              corpName={CORP_NAME}
              cause="otherPayee"
              entries={[
                { id: 'a1', payeeName: 'Ashfall Mining', taxOwed: 4_271_257, paid: !twoBooks },
              ]}
              recordedAt="Talidal - Ishimura Heavy Industries"
              resolvesOn="2026-11-12"
              others={twoBooks ? [{ corpName: 'Ashfall Prospecting', billAmount: 120_000 }] : []}
            />
          ) : undefined
        }
      />
    </>
  );
}

const meta = {
  title: 'miningTax/CorpRowDetailModal',
  component: Story,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Story>;
export default meta;
type S = StoryObj<typeof meta>;

export const Conflict: S = {
  args: {
    view: {
      ...base,
      state: 'conflict',
      taxOwed: null,
      resolvesAt: '2026-11-12T11:00:00Z',
      billed: 319_000,
    },
    conflict: true,
  },
};

export const Billed: S = { args: { view: base } };

export const PaidDayDiffers: S = { args: { view: { ...base, state: 'paid' }, closed: true } };

export const Dismissed: S = {
  args: {
    view: { ...base, state: 'dismissed', taxOwed: 0, dismissalReason: 'Fleet op, corp-sanctioned' },
  },
};

export const Paid: S = {
  args: {
    view: { ...base, state: 'paid', taxOwed: 0 },
  },
};

export const ConflictTwoBooks: S = {
  args: {
    view: {
      ...base,
      state: 'conflict',
      taxOwed: null,
      resolvesAt: '2026-11-12T11:00:00Z',
      billed: 319_000,
    },
    conflict: true,
    twoBooks: true,
  },
};
