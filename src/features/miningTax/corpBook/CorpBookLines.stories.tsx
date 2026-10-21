import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui/DataTable';
import { Panel } from '@/components/ui/Panel';
import type { BookRowView, PersonalOverlay } from '@/engine/corpTaxBook/personal';
import { useIsPhone } from '@/lib/useIsPhone';
import { useTaxColumns } from '../useTaxColumns';
import { buildDisplayRows } from './corpRows';
import { useCorpStateLabel } from './useCorpStateText';

/**
 * The corporation's lines on a miner's Moon Mining Tax tab (issue #4622): the refinery beside
 * the corporation, a correction that keeps the old figure, and the mark for ore the miner's
 * own list also gives a Payee. The real Tax tab columns, fed from a fixed overlay.
 */
const ZEO = 45490;
const CORP = 98000001;
const CORP_NAME = 'Brass Meridian Logistics';

const line = (over: Partial<BookRowView>): BookRowView => ({
  id: `${CORP}:1:1000:2026-10-17`,
  corporationId: CORP,
  corpName: CORP_NAME,
  characterId: 1,
  date: '2026-10-17',
  solarSystemId: 30003838,
  state: 'billed',
  oreLines: [{ typeId: ZEO, quantity: 43_050 }],
  unitPrices: { [ZEO]: 148 },
  priceSources: { [ZEO]: 'saved' },
  taxPct: 15,
  rateScope: 'corp',
  estimatedValue: 6_371_400,
  taxOwed: 955_710,
  billed: 955_710,
  hubId: 'jita',
  oreForm: 'compressed',
  ...over,
});

const overlay: PersonalOverlay = {
  rows: [
    line({ refineryLabel: 'Efa VII - Ashfall Tatara' }),
    line({
      id: `${CORP}:1:2000:2026-10-17`,
      structureId: 2000,
      refineryLabel: 'Efa IV - Moon Drill',
      taxOwed: 855_710,
      billed: 855_710,
      correction: {
        before: 955_710,
        after: 855_710,
        reasons: ['Wrong hub price'],
      },
    }),
    line({
      id: `${CORP}:1:2000:2026-10-16`,
      date: '2026-10-16',
      structureId: 2000,
      refineryLabel: 'Efa IV - Moon Drill',
      overlap: { payeeIds: ['ashfall'], ore: [{ typeId: ZEO, quantity: 20_000 }], paid: false },
    }),
  ],
  takenFromFree: new Map(),
  labels: new Map(),
  books: [],
};

function MinerLines() {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const corpStateLabel = useCorpStateLabel();
  const rows = buildDisplayRows([], overlay, () => 'Kestrel Vane');
  const { baseColumns } = useTaxColumns({
    isPhone,
    showOreColumn: false,
    showValueColumn: true,
    showCharacterColumn: false,
    showSelectColumn: false,
    typeNames: new Map([[ZEO, 'Zeolites']]),
    systemSecurity: new Map([[30003838, -0.1]]),
    selection: new Set(),
    expandedCombined: new Set(),
    toggleRowSelected: () => undefined,
    toggleCombinedExpanded: () => undefined,
    estimatedValueOf: (dr) => dr.assignment?.estimatedValue ?? 0,
    systemName: () => 'Efa',
    payeeDisplayName: () => t('miningTax.corpBook.payeeName', { corp: CORP_NAME }),
    corpStateLabel,
  });
  return (
    <Panel padded={false}>
      <div className="overflow-x-auto">
        <DataTable
          columns={baseColumns}
          rows={rows}
          className="dt-dense-lead sm:table-fixed"
          rowKey={(dr) => dr.key}
          label="Moon mining tax"
          stackLayout="dense"
        />
      </div>
    </Panel>
  );
}

const meta = {
  title: 'miningTax/CorpBookLines',
  component: MinerLines,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MinerLines>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Refinery labels, a corrected line and an overlap mark. */
export const Default: Story = {};
