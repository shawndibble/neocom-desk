import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  PageHeader,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { ReauthBanner } from '@/components/ui/ReauthBanner';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import { Widget } from '@/features/overview/widgets/Widget';
import { sampleView } from '@/features/overview/widgets/gallerySamples';
import { cx } from '@/lib/cx';
import {
  FAILOVER,
  FLUX_LOG,
  STEREO,
  PHONE,
  WHY_MILITARY_CAMPAIGNS,
  approxK,
  rewardTotal,
  seedThreeCharacters,
  turnInShell,
  type TurnInItem,
} from './campaignTurnInsFixtures';
import { PermissionCellMark, TurnInDetail } from './campaignTurnInsParts';
import { NewComponent } from './NewComponent';

/**
 * New Overview widget kind **Military Campaigns**. It is added from the
 * Gallery and is not on the default board.
 *
 * - **List** (default): the active Campaign Objectives one of the widget's
 *   Characters has pressed Participate on, of any type (mining, ratting,
 *   missions, hacking, Faction Warfare…), with that Character's contribution
 *   and what it has earned. It also lists turn-in objectives whose items they
 *   hold ("You hold 640 · ~37.1M turned in"). Each row shows % filled. A
 *   turn-in row opens `TurnInDetail`; the others open nothing.
 * - **Number** (Small): "~73.1M waiting to turn in".
 * - A per-widget **Faction** setting (All by default, or Amarr / Caldari /
 *   Gallente / Minmatar), in the ⋮ menu beside View and Characters.
 *
 * When some Characters lack Military Campaigns, the widget lists the granted
 * Characters' rows and shows one amber mark in the header naming the rest.
 * When all of them lack it, the board's own "needs permission" Widget State
 * shows (a ghost `GrantBanner`).
 *
 * The card copies `WidgetFrame`'s markup, since a new kind cannot draw through
 * the real `Widget` without being registered. The neighbours are real sample
 * widgets.
 *
 * New components in this mockup: `MilitaryCampaignsWidget` (the kind's card
 * and List body), `PermissionCellMark`, `TurnInDetail`.
 */

type Faction = 'Amarr' | 'Caldari' | 'Gallente' | 'Minmatar';

interface ObjectiveRow {
  key: string;
  faction: Faction;
  title: string;
  detail: string;
  filledPct: number;
  /** A turn-in: its item and how many the Characters hold. */
  turnIn?: { item: TurnInItem; held: number; character: string };
}

const turnIn = (item: TurnInItem, held: number, character: string): ObjectiveRow => ({
  key: item.name,
  faction: item.faction,
  title: `Turn in ${item.name}`,
  detail: `You hold ${held.toLocaleString('en-US')} · ${approxK(rewardTotal(item, held))} turned in`,
  filledPct: item.filledPct,
  turnIn: { item, held, character },
});

const ROWS: readonly ObjectiveRow[] = [
  {
    key: 'mine',
    faction: 'Caldari',
    title: 'Mine Aberrant ore',
    detail: 'Kestrel Vane · 48,200 m³ mined · 3.4M earned',
    filledPct: 41,
  },
  turnIn(FAILOVER, 640, 'Kestrel Vane'),
  {
    key: 'rat',
    faction: 'Minmatar',
    title: 'Destroy Angel Cartel forces',
    detail: 'Orsa Tellemar · 22 kills · 1.1M earned',
    filledPct: 63,
  },
  turnIn(STEREO, 400, 'Orsa Tellemar'),
  {
    key: 'missions',
    faction: 'Amarr',
    title: 'Complete security missions',
    detail: 'Kestrel Vane · 4 missions · 2.0M earned',
    filledPct: 8,
  },
  turnIn(FLUX_LOG, 200, 'Kestrel Vane'),
  {
    key: 'hack',
    faction: 'Gallente',
    title: 'Hack Serpentis data sites',
    detail: 'Orsa Tellemar · 6 sites · 0.9M earned',
    filledPct: 55,
  },
];

const WAITING = ROWS.reduce(
  (s, r) => s + (r.turnIn ? rewardTotal(r.turnIn.item, r.turnIn.held) : 0),
  0
);

type State = 'ok' | 'empty' | 'needsPermission';

interface Options {
  view: 'list' | 'number';
  faction?: Faction | 'All';
  state?: State;
  /** Characters without Military Campaigns: named by the header's mark. */
  missing?: readonly string[];
  openRow?: string;
  openMark?: boolean;
  openMenu?: boolean;
}

function ListBody({ opts }: { opts: Options }) {
  const faction = opts.faction ?? 'All';
  const rows = ROWS.filter((r) => faction === 'All' || r.faction === faction);
  const waiting = rows.reduce(
    (s, r) => s + (r.turnIn ? rewardTotal(r.turnIn.item, r.turnIn.held) : 0),
    0
  );
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 px-3 pt-2.5 pb-2 text-2xl leading-tight font-semibold tabular-nums">
        {approxK(waiting).slice(1)}
        <small className="text-xs font-normal text-text-dim">waiting to turn in</small>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {rows.map((row) => {
          const content = (
            <>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  {faction === 'All' && <Pill className="shrink-0">{row.faction}</Pill>}
                  <span
                    className={cx(
                      'truncate text-sm',
                      row.turnIn && 'text-accent underline decoration-dashed underline-offset-2'
                    )}
                  >
                    {row.title}
                  </span>
                </span>
                <span className="block truncate text-xs text-text-dim">{row.detail}</span>
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums">
                {row.filledPct}%<span className="block text-text-dim">filled</span>
              </span>
            </>
          );
          const rowClass =
            'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5 text-left';
          return (
            <li key={row.key}>
              {row.turnIn ? (
                <TurnInDetail
                  item={row.turnIn.item}
                  character={row.turnIn.character}
                  state="participating"
                  extra={row.detail}
                  defaultOpen={opts.openRow === row.key}
                  trigger={
                    <button type="button" className={cx(rowClass, 'hover:bg-panel-2')}>
                      {content}
                    </button>
                  }
                />
              ) : (
                <div className={rowClass}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NumberBody() {
  return (
    <div className="grid gap-1 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-2xl leading-tight font-semibold tabular-nums">
        {approxK(WAITING).slice(1)}
        <small className="text-xs font-normal text-text-dim">waiting to turn in</small>
      </div>
      <p className="text-sm text-text-dim">3 items · 2 Characters · 7 objectives</p>
    </div>
  );
}

function SettingsMenu({ opts }: { opts: Options }) {
  return (
    <DropdownMenu defaultOpen={opts.openMenu}>
      <DropdownMenuTrigger asChild>
        <IconButton
          size="sm"
          variant="plain"
          icon={<Icon.More />}
          label="Military Campaigns settings"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={opts.view}>
          <DropdownMenuRadioItem value="number">Number</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="list">List</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <div className="rounded-xs outline-dashed outline-1 outline-offset-[-2px] outline-warning">
          <DropdownMenuLabel>Faction</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={opts.faction ?? 'All'}>
            {['All', 'Amarr', 'Caldari', 'Gallente', 'Minmatar'].map((f) => (
              <DropdownMenuRadioItem key={f} value={f}>
                {f}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Characters</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="all">
          <DropdownMenuRadioItem value="header">This character</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="all">All characters</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Rename…</DropdownMenuItem>
        <DropdownMenuItem>Remove</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** New component: the kind's card, in `WidgetFrame`'s markup. */
function MilitaryCampaignsWidget({ opts }: { opts: Options }) {
  const state = opts.state ?? 'ok';
  const small = opts.view === 'number';
  let body: ReactNode;
  if (state === 'needsPermission') {
    body = (
      <div className="grid gap-2 p-3 text-sm">
        <ReauthBanner
          variant="ghost"
          title="Kestrel Vane: grant Military Campaigns"
          actionLabel="Grant in EVE"
          onLogin={() => {}}
        />
      </div>
    );
  } else if (state === 'empty') {
    body = (
      <div className="grid gap-2 p-3 text-sm">
        <b>No Military Campaign running</b>
        <span className="text-text-dim">
          Campaign Objectives your Characters Participate in, and turn-ins for items they hold, show
          here while a faction runs a Military Campaign.
        </span>
      </div>
    );
  } else {
    body = small ? <NumberBody /> : <ListBody opts={opts} />;
  }
  const missing = opts.missing ?? [];
  return (
    <NewComponent name="MilitaryCampaignsWidget">
      <section
        aria-label="Military Campaigns"
        className="flex h-full w-full min-w-0 flex-col rounded-xs border border-line bg-panel"
      >
        <div
          className={cx(
            'flex items-center gap-1.5 border-b border-line pr-1 pl-2.5',
            tappableRowClassName
          )}
        >
          <h2 className="min-w-0 truncate text-[0.6875rem] font-semibold tracking-widest uppercase">
            Military Campaigns
          </h2>
          {/* Glyph only: the kind's long title needs the room at Medium. */}
          <CharacterScopeReadout scope="all" total={3} compact />
          {opts.faction && opts.faction !== 'All' && (
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              · {opts.faction}
            </span>
          )}
          {missing.length > 0 && state === 'ok' && (
            <PermissionCellMark
              character={missing.join(', ')}
              why={WHY_MILITARY_CAMPAIGNS(missing.join(', '))}
              defaultOpen={opts.openMark}
            />
          )}
          <span className="flex-1" />
          <SettingsMenu opts={opts} />
        </div>
        <div className="flex-1">{body}</div>
      </section>
    </NewComponent>
  );
}

function Neighbour({ kind }: { kind: 'wallet' | 'orders' | 'lp' }) {
  const { t } = useTranslation();
  const view = sampleView(kind, t);
  if (!view) return null;
  return (
    <Widget
      widget={{ id: kind, kind, size: 'S', view: 'number', scope: 'header', showOnPhone: true }}
      previewView={view}
    />
  );
}

function Board({ opts }: { opts: Options }) {
  return (
    <div className="mx-auto grid max-w-page gap-3 px-4 pt-3 pb-24">
      <PageHeader title="Overview" meta="Kestrel Vane" />
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className={opts.view === 'list' ? 'sm:col-span-2 lg:col-span-1 lg:row-span-2' : ''}>
          <MilitaryCampaignsWidget opts={opts} />
        </div>
        <Neighbour kind="wallet" />
        <Neighbour kind="orders" />
        <Neighbour kind="lp" />
      </div>
    </div>
  );
}

/** The Gallery's card for the kind, in `GalleryItem`'s markup, with the List preview. */
function GalleryCard() {
  return (
    <div className="mx-auto max-w-[460px] px-4 py-4">
      <p className="mb-2 text-xs font-semibold tracking-widest text-text-dim uppercase">
        Gallery › Activity
      </p>
      <NewComponent name="MilitaryCampaignsWidget (Gallery card)">
        <div className="grid gap-2 rounded-xs border border-line bg-panel-2 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Military Campaigns</div>
              <p className="mt-0.5 text-sm text-text-dim">
                Campaign Objectives your Characters Participate in, and what turning in what they
                hold would pay.
              </p>
            </div>
            <Button size="sm">Add</Button>
          </div>
          <ul className="flex flex-wrap items-center gap-1.5">
            {['Number', 'List', 'Size: Medium'].map((b) => (
              <li
                key={b}
                className="rounded-xs border border-line px-1.5 py-px text-[0.6875rem] text-text-dim"
              >
                {b}
              </li>
            ))}
          </ul>
          <div className="pointer-events-none rounded-xs border border-line bg-panel" inert>
            <ListBody opts={{ view: 'list' }} />
          </div>
        </div>
      </NewComponent>
    </div>
  );
}

const meta = {
  title: 'mockups/CampaignTurnIns/Widget',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: turnInShell('/', seedThreeCharacters) },
  render: () => <Board opts={{ view: 'list' }} />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary List (default view), all factions: objectives Participated in plus turn-ins for held items, % filled each. */
export const List: Story = {};

/** @summary A turn-in row pressed: TurnInDetail with what the Characters hold. Other rows open nothing. */
export const ListTurnInOpen: Story = {
  render: () => <Board opts={{ view: 'list', openRow: FAILOVER.name }} />,
};

/** @summary Number view at Small: what the held turn-in items would pay. */
export const NumberView: Story = { render: () => <Board opts={{ view: 'number' }} /> };

/** @summary Faction setting = Caldari: only Caldari objectives; the header names the faction. */
export const CaldariOnly: Story = {
  render: () => <Board opts={{ view: 'list', faction: 'Caldari' }} />,
};

/** @summary The ⋮ menu: View (Number / List), the new Faction setting, Characters. */
export const SettingsMenuOpen: Story = {
  render: () => <Board opts={{ view: 'list', openMenu: true }} />,
};

/** @summary Mira Solenne lacks Military Campaigns: the granted Characters' rows, one amber mark in the header naming her (opened). */
export const SomeCharactersMissing: Story = {
  render: () => <Board opts={{ view: 'list', missing: ['Mira Solenne'], openMark: true }} />,
};

/** @summary No Character has granted it: the board's needs-permission Widget State (ghost GrantBanner). */
export const NeedsPermission: Story = {
  render: () => <Board opts={{ view: 'list', state: 'needsPermission' }} />,
};

/** @summary No Military Campaign running: the empty state. */
export const Empty: Story = { render: () => <Board opts={{ view: 'list', state: 'empty' }} /> };

/** @summary The kind's card in the Gallery ("Add a widget"), with its List preview. */
export const GalleryItem: Story = { render: () => <GalleryCard /> };

/** @summary List in the phone shell. */
export const ListPhone: Story = { globals: PHONE };

/** @summary Phone: a turn-in row pressed. */
export const ListTurnInOpenPhone: Story = {
  globals: PHONE,
  render: () => <Board opts={{ view: 'list', openRow: FAILOVER.name }} />,
};
