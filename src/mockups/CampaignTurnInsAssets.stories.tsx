import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  DataTable,
  IskAmount,
  PageHeader,
  Panel,
  type DataTableColumn,
} from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import * as Icon from '@/components/ui/icons';
import { CharacterBadge } from '@/features/assets/assetBrowserRows';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  CHARACTERS,
  FAILOVER,
  FLUX_LOG,
  STEREO,
  STRATEGIC_INTEL,
  PHONE,
  WAYPOINT_PERMISSION,
  WHY_WAYPOINTS,
  approxK,
  rewardTotal,
  seedThreeCharacters,
  turnInShell,
  type MockCharacter,
  type TurnInItem,
  type WriteState,
} from './campaignTurnInsFixtures';
import { MaybeNew, PermissionCellMark, TurnInDetail, TurnInGlyph } from './campaignTurnInsParts';

/**
 * Campaign turn-ins on Assets. No extra lines: a small dim glyph after an owned
 * turn-in stack's value opens `TurnInDetail` ("You hold 340 · ~19.1M turned
 * in"). The value stays the market estimate.
 *
 * Under the station's items, one line per Character and War HQ offers **Haul
 * to War HQ**, the existing `HaulWaypointButton` pattern (it sets the trader's
 * system as that Character's autopilot destination). A Character without the
 * Autopilot waypoints Permission (Write to EVE) gets the button aria-disabled
 * with a `PermissionCellMark` after it, and no reason text.
 *
 * Stacks belong to three Characters: Kestrel Vane (signed up, waypoints
 * granted), Orsa Tellemar (not signed up, waypoints granted) and Mira Solenne
 * (Military Campaigns and waypoints missing).
 *
 * New components in this mockup: `TurnInHaulLines`, `TurnInDetail`,
 * `PermissionCellMark`, and the glyph trigger.
 */

interface AssetRow {
  id: number;
  name: string;
  turnIn?: TurnInItem;
  quantity: number;
  character: MockCharacter;
  value: number;
}

const ROWS: readonly AssetRow[] = [
  {
    id: 1,
    name: FAILOVER.name,
    turnIn: FAILOVER,
    quantity: 340,
    character: CHARACTERS.kestrel,
    value: 340 * FAILOVER.jitaBuy,
  },
  {
    id: 2,
    name: STEREO.name,
    turnIn: STEREO,
    quantity: 120,
    character: CHARACTERS.orsa,
    value: 120 * STEREO.jitaBuy,
  },
  {
    id: 3,
    name: STRATEGIC_INTEL.name,
    turnIn: STRATEGIC_INTEL,
    quantity: 200,
    character: CHARACTERS.mira,
    value: 200 * STRATEGIC_INTEL.jitaBuy,
  },
  {
    id: 4,
    name: 'Damage Control II',
    quantity: 12,
    character: CHARACTERS.kestrel,
    value: 12 * 1_041_000,
  },
  {
    id: 5,
    name: 'Tritanium',
    quantity: 2_400_000,
    character: CHARACTERS.kestrel,
    value: 2_400_000 * 3.95,
  },
  {
    id: 6,
    name: FLUX_LOG.name,
    turnIn: FLUX_LOG,
    quantity: 100,
    character: CHARACTERS.mira,
    value: 100 * FLUX_LOG.jitaBuy,
  },
];

/** Who may set waypoints: only Mira lacks Autopilot waypoints. */
const WRITE: Record<string, WriteState> = {
  [CHARACTERS.kestrel.name]: 'granted',
  [CHARACTERS.orsa.name]: 'granted',
  [CHARACTERS.mira.name]: 'missing',
};

interface Options {
  open?: number;
  openHaulMark?: boolean;
  today?: boolean;
}

function Value({ row, opts }: { row: AssetRow; opts: Options }) {
  const item = row.turnIn;
  return (
    <span className="inline-flex items-center whitespace-nowrap tabular-nums">
      <IskAmount value={row.value} />
      {item && !opts.today && (
        <TurnInDetail
          item={item}
          character={row.character.name}
          state={row.character.state}
          write={WRITE[row.character.name]}
          extra={`You hold ${row.quantity} · ${approxK(rewardTotal(item, row.quantity))} turned in`}
          defaultOpen={opts.open === row.id}
          trigger={<TurnInGlyph label={`Turn-in reward for ${row.name}`} />}
        />
      )}
    </span>
  );
}

const COLUMNS = (opts: Options): DataTableColumn<AssetRow>[] => [
  {
    id: 'item',
    header: 'Item',
    primary: true,
    render: (row) => (
      <span className="flex flex-wrap items-center">
        <span className={entityLinkClassName('font-medium')}>{row.name}</span>
        <CharacterBadge characterName={row.character.name} />
      </span>
    ),
  },
  {
    id: 'quantity',
    header: 'Qty',
    align: 'right',
    className: 'whitespace-nowrap tabular-nums',
    render: (row) => row.quantity.toLocaleString('en-US'),
  },
  {
    id: 'value',
    header: 'Est. value',
    align: 'right',
    render: (row) => <Value row={row} opts={opts} />,
  },
];

/** One line per Character and War HQ, each with its Haul to War HQ. */
function TurnInHaulLines({ opts }: { opts: Options }) {
  const groups = new Map<
    string,
    { character: MockCharacter; item: TurnInItem; rows: AssetRow[] }
  >();
  for (const row of ROWS) {
    if (!row.turnIn) continue;
    const key = `${row.character.name}|${row.turnIn.system}`;
    const group = groups.get(key) ?? { character: row.character, item: row.turnIn, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return (
    <MaybeNew name="TurnInHaulLines" labelled>
      <ul aria-label="Turn in at War HQs" className="divide-y divide-line text-xs">
        {[...groups.values()].map(({ character, item, rows }) => {
          const write = WRITE[character.name];
          const total = rows.reduce((s, r) => s + rewardTotal(r.turnIn!, r.quantity), 0);
          return (
            <li
              key={`${character.name}-${item.system}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1">
                  <Icon.Faction size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                  <span className="font-semibold">
                    {item.trader} · {item.system}
                  </span>
                  <CharacterBadge characterName={character.name} />
                </span>
                <span className="block text-text-dim">
                  {rows.map((r) => `${r.quantity} ${r.name}`).join(', ')} · {approxK(total)} turned
                  in
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  aria-disabled={write !== 'granted' || undefined}
                  aria-label={`Haul to War HQ: set ${item.system} as ${character.name}'s destination`}
                >
                  Haul to War HQ
                </Button>
                {write === 'missing' && (
                  <PermissionCellMark
                    character={character.name}
                    permission={WAYPOINT_PERMISSION}
                    why={WHY_WAYPOINTS(character.name)}
                    defaultOpen={opts.openHaulMark && item === STRATEGIC_INTEL}
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </MaybeNew>
  );
}

function PhoneRows({ opts }: { opts: Options }) {
  return (
    <ul aria-label="Items" className="divide-y divide-line">
      {ROWS.map((row) => (
        <li key={row.id} className="px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className={entityLinkClassName('min-w-0 truncate font-medium')}>{row.name}</span>
            <span className="shrink-0 text-xs font-semibold">
              <Value row={row} opts={opts} />
            </span>
          </div>
          <div className="mt-0.5 flex items-center text-xs text-text-dim">
            <span className="tabular-nums">× {row.quantity.toLocaleString('en-US')}</span>
            <CharacterBadge characterName={row.character.name} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AssetsMockup(opts: Options) {
  const phone = useIsPhone();
  return (
    <div className="mx-auto flex max-w-page flex-col gap-4 px-4 py-4 pb-24">
      <PageHeader title="Assets" />
      <Panel
        title="Jita IV - Moon 4 - Caldari Navy Assembly Plant"
        meta={<span className="text-xs text-text-dim">6 stacks · 0 jumps</span>}
        padded={false}
      >
        {phone ? (
          <PhoneRows opts={opts} />
        ) : (
          <DataTable
            columns={COLUMNS(opts)}
            rows={ROWS}
            rowKey={(row) => row.id}
            label="Items at Jita IV - Moon 4"
            responsive="table"
          />
        )}
        {!opts.today && (
          <div className="border-t border-line p-2">
            <TurnInHaulLines opts={opts} />
          </div>
        )}
      </Panel>
    </div>
  );
}

const meta = {
  title: 'mockups/CampaignTurnIns/Assets',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: turnInShell('/assets', seedThreeCharacters) },
  render: () => <AssetsMockup />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Today: owned stacks with their market value. */
export const Today: Story = { render: () => <AssetsMockup today /> };

/** @summary Glyph after each turn-in stack's value; Haul to War HQ per Character and War HQ. Kestrel's Failover detail open. */
export const Mixed: Story = { render: () => <AssetsMockup open={1} /> };

/** @summary Mira's Strategic Intel glyph pressed: Military Campaigns and Autopilot waypoints both missing, marks inside. */
export const PermissionMissing: Story = { render: () => <AssetsMockup open={3} /> };

/** @summary Mira's Haul to War HQ is aria-disabled; the mark after it pressed opens the Autopilot waypoints grant. */
export const HaulWaypointsMissing: Story = { render: () => <AssetsMockup openHaulMark /> };

/** @summary Phone: the glyph after the value, the haul lines under the stacks. */
export const MixedPhone: Story = { globals: PHONE };
