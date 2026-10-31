import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import { Widget } from './Widget';
import { corpSrp } from './data/corpSrpModels';
import type { CorpSrpFeed, SrpClaimRow } from './data/corpFeeds';
import type { BuildContext, KindView } from './data/types';
import type { Widget as WidgetModel } from './layout';

/**
 * The Corp Board's `corpSrp` widget: the real builder over a sample feed, drawn in
 * the real Widget shell. States: Number, Table, empty, SRP not turned on. The phone stories use
 * the phone viewport; the shell hides the Killmail column there.
 */
const meta = {
  title: 'overview/CorpSrpWidget',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const claim = (
  id: number,
  name: string,
  hullTypeId: number,
  solarSystemId: number,
  amount: number,
  state: SrpClaimRow['state']
): SrpClaimRow => ({
  killmailId: id,
  state,
  amount,
  characterName: name,
  hullTypeId,
  solarSystemId,
  filedAt: id,
});

const CLAIMS: SrpClaimRow[] = [
  claim(1, 'Tamsin Varro', 1, 10, 38_400_000, 'pending'),
  claim(2, 'Ilse Quor', 2, 11, 24_150_000, 'pending'),
  claim(3, 'Dax Orlen', 3, 12, 212_000_000, 'approved'),
  claim(4, 'Mira Venn', 4, 13, 1_900_000, 'approved'),
  claim(5, 'Joss Kade', 5, 14, 61_000_000, 'pending'),
  claim(6, 'Nia Brandt', 6, 15, 9_800_000, 'approved'),
  claim(7, 'Orrin Teal', 7, 16, 700_000, 'pending'),
];

function feed(over: Partial<CorpSrpFeed>): CorpSrpFeed {
  return {
    readable: true,
    needsReauth: false,
    fetchedAt: null,
    fromCache: false,
    enabled: true,
    canSetUp: true,
    claims: CLAIMS,
    typeNames: new Map(
      ['Drake', 'Thorax', 'Megathron', 'Rifter', 'Hurricane', 'Caracal', 'Tristan'].map((n, i) => [
        i + 1,
        n,
      ])
    ),
    systemNames: new Map(
      ['Tama', 'Amamake', 'Jita', 'Old Man Star', 'Hek', 'Rens', 'Dodixie'].map((n, i) => [
        i + 10,
        n,
      ])
    ),
    ...over,
  };
}

function tile(view: WidgetModel['view']): WidgetModel {
  return { id: 'srp', kind: 'corpSrp', size: 'M', view, scope: 'header', showOnPhone: true };
}

function Srp({ data, view }: { data: CorpSrpFeed; view: WidgetModel['view'] }): ReactNode {
  const { t } = useTranslation();
  const built: KindView = corpSrp({ corpSrp: { data, error: false, loading: false } }, {
    t,
    now: 0,
    range: 30,
    activeCharacterId: 1,
  } as unknown as BuildContext);
  return (
    <div className="mx-auto grid max-w-page gap-3 px-4 pt-3 pb-8">
      <PageHeader title="Corp Board" meta="Ashen Vanguard" />
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Widget widget={tile(view)} previewView={built} onRemove={() => undefined} />
      </div>
    </div>
  );
}

const PHONE = { viewport: { value: 'mobile1', isRotated: false } } as const;

/** @summary Number: open (Pending) claims, ISK owed (Approved, not yet Paid), Review claims link. */
export const NumberView: Story = { render: () => <Srp data={feed({})} view="number" /> };

/** @summary Number in the phone shell. */
export const NumberViewPhone: Story = { ...NumberView, globals: PHONE };

/** @summary Table: pilot, killmail, amount and status per open claim. */
export const TableView: Story = { render: () => <Srp data={feed({})} view="table" /> };

/** @summary Table in the phone shell: Pilot, Amount, Status. */
export const TableViewPhone: Story = { ...TableView, globals: PHONE };

/** @summary SRP on, no claim open: empty state with an Open SRP link. */
export const Empty: Story = {
  render: () => <Srp data={feed({ claims: [] })} view="table" />,
};

/** @summary Empty in the phone shell. */
export const EmptyPhone: Story = { ...Empty, globals: PHONE };

/** @summary SRP off, officer is a Director: Set up SRP. */
export const NotTurnedOn: Story = {
  render: () => <Srp data={feed({ enabled: false, claims: [] })} view="table" />,
};

/** @summary Not turned on in the phone shell. */
export const NotTurnedOnPhone: Story = { ...NotTurnedOn, globals: PHONE };

/** @summary SRP off, officer is not a Director: told who can turn it on, no link. */
export const NotTurnedOnAccountant: Story = {
  render: () => <Srp data={feed({ enabled: false, canSetUp: false, claims: [] })} view="table" />,
};
