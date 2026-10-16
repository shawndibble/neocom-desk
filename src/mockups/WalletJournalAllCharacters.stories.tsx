import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable, Panel, type DataTableColumn } from '@/components/ui';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { formatIsk } from '@/lib/isk';
import { Wallet } from '@/routes/Wallet';
import { NewComponent } from './NewComponent';

/**
 * Proposal: Wallet › Journal's "Where the ISK went" reads every tracked
 * Character, and ISK moved between your own Characters comes out of In and Out.
 *
 * New components in this mockup: `BetweenYourCharactersRow` (the collapsed
 * line under the table) and `CharacterCoverageNote` (the "1 of 2 loaded"
 * readout). The Character filter is the existing `CharacterFilterControl`; the
 * table is the existing breakdown, with one new raw row, "PLEX bought".
 */

interface Row {
  refType: string;
  net: number;
  income: number;
  expense: number;
}

const rows: Row[] = [
  { refType: 'Bounty prizes', net: 412_350_000, income: 412_350_000, expense: 0 },
  { refType: 'Market transaction', net: -188_900_000, income: 96_400_000, expense: 285_300_000 },
  { refType: 'PLEX bought', net: -152_000_000, income: 0, expense: 152_000_000 },
  { refType: 'Insurance', net: 21_600_000, income: 24_000_000, expense: 2_400_000 },
  { refType: 'Brokers fee', net: -6_120_000, income: 0, expense: 6_120_000 },
  { refType: 'Transaction tax', net: -3_870_000, income: 0, expense: 3_870_000 },
];

const signed = (value: number) => (value > 0 ? `+${formatIsk(value)}` : formatIsk(value));
const tone = (value: number) => (value > 0 ? 'text-isk-pos' : value < 0 ? 'text-isk-neg' : '');

const columns: DataTableColumn<Row>[] = [
  { id: 'refType', header: 'Ref type', render: (row) => row.refType },
  {
    id: 'net',
    header: 'Net',
    align: 'right',
    className: 'tabular-nums',
    cellClassName: (row) => tone(row.net),
    render: (row) => (
      <>
        {signed(row.net)}
        {row.income > 0 && row.expense > 0 && (
          <span className="block text-xs font-normal text-text-dim">
            in {formatIsk(row.income)} · out {formatIsk(row.expense)}
          </span>
        )}
      </>
    ),
  },
];

const totalIn = rows.reduce((sum, row) => sum + row.income, 0);
const totalOut = rows.reduce((sum, row) => sum + row.expense, 0);

function Proposal({ partial }: { partial: boolean }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-4">
      <Panel
        title="Where the ISK went"
        meta={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
            <span>
              In <span className="text-isk-pos">{formatIsk(totalIn)}</span>
            </span>
            <span>
              Out <span className="text-isk-neg">{formatIsk(totalOut)}</span>
            </span>
            <span>
              Net <span className={tone(totalIn - totalOut)}>{signed(totalIn - totalOut)}</span>
            </span>
          </span>
        }
        actions={
          <CharacterFilterControl
            activeCharacterId={2119876543}
            value="all"
            onChange={() => {}}
            characterCount={2}
          />
        }
      >
        {partial && (
          <NewComponent name="CharacterCoverageNote">
            <p className="px-3 py-2 text-xs text-warning">
              1 of 2 Characters loaded. Orsa Tellemar has not granted the wallet permission, so ISK
              sent to or from Orsa Tellemar stays in In and Out.
            </p>
          </NewComponent>
        )}
        <DataTable
          label="Where the ISK went, all Characters"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.refType}
          density="compact"
        />
        <NewComponent name="BetweenYourCharactersRow">
          <div className="flex items-center justify-between px-3 py-2 text-sm text-text-dim">
            <span>
              Between your Characters · 7 entries, left out of In and Out
              <span className="block text-xs">
                Donations, contracts and trades where both sides are your Characters. ISK moved
                through a corporation wallet is still counted.
              </span>
            </span>
            <span className="tabular-nums">{formatIsk(240_000_000)}</span>
          </div>
        </NewComponent>
      </Panel>
    </div>
  );
}

const meta = {
  title: 'mockups/WalletJournalAllCharacters',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/wallet/journal' } },
  render: () => (
    <>
      <Proposal partial={false} />
      <Wallet />
    </>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary All Characters selected: own-Character transfers collapse into one line below the table. New components: BetweenYourCharactersRow. */
export const Proposed: Story = {};

/** @summary One Character has no wallet permission: the note says which, and its transfers stay counted. New components: CharacterCoverageNote, BetweenYourCharactersRow. */
export const PartialCoverage: Story = {
  render: () => (
    <>
      <Proposal partial />
      <Wallet />
    </>
  ),
};

/** @summary The proposal in the phone shell. */
export const ProposedPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
