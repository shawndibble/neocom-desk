import type { Meta, StoryObj } from '@storybook/react-vite';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { DisplayRow } from '../groupRows';
import { ConflictNotice } from './ConflictNotice';
import { CorpRowDetailModal } from './CorpRowDetailModal';
import type { CorpRowInfo } from './corpRows';

/**
 * A Corp Tax Book day's detail: the book's side as a few labelled facts, and on a
 * Conflict day the notice naming the clashing entry ahead of everything else.
 */
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

function Story({
  view,
  conflict = false,
  twoBooks = false,
}: {
  view: BookRowView;
  conflict?: boolean;
  twoBooks?: boolean;
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
      {/* The modal portals out; this keeps the story root non-empty for screenshots. */}
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
          conflict ? (
            <ConflictNotice
              corpName={CORP_NAME}
              cause="otherPayee"
              entries={[
                { id: 'a1', payeeName: 'Ashfall Mining', taxOwed: 4_271_257, paid: !twoBooks },
              ]}
              recordedAt="Talidal - Ishimura Heavy Industries"
              others={twoBooks ? [{ corpName: 'Ashfall Prospecting', billAmount: 120_000 }] : []}
              previews={[]}
              typeNames={new Map()}
              onUnmarkPaid={() => {}}
              onTakeOver={() => {}}
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

/** @summary A Conflict day: which entry clashes, when it resolves, and the two ways to fix it. */
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

/** @summary A Billable day not yet on a Statement: what bills it and when the book last synced. */
export const Billed: S = { args: { view: base } };

/** @summary A dismissed day: what was originally billed and the corporation's reason. */
export const Dismissed: S = {
  args: {
    view: { ...base, state: 'dismissed', taxOwed: 0, dismissalReason: 'Fleet op, corp-sanctioned' },
  },
};

/** @summary A day two corporations' books both contest: one take-over does the split for both. */
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
