import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { cx } from '@/lib/cx';
import {
  FAILOVER,
  STRATEGIC_INTEL,
  PHONE,
  turnInShell,
  type TurnInState,
  type WriteState,
} from './campaignTurnInsFixtures';
import { TurnInDetailBody, type TurnInDetailProps } from './campaignTurnInsParts';
import { NewComponent } from './NewComponent';

/**
 * `TurnInDetail`: the one single-item popover every surface opens (Appraisal
 * row, Market item, Open Orders, Assets, Hauling, the Overview widget). Each
 * surface only supplies its trigger.
 *
 * It holds the item, the Turn-in Reward each and its split (ISK + LP at the LP
 * Value), the Item Trader and system, how full the Campaign Objective is, the
 * Character's Participate state, "LP paid per full 100 items", "+ faction
 * tokens", and Set destination to the trader's system.
 *
 * Here every variant is drawn side by side as a static popover surface.
 *
 * New components in this mockup: `TurnInDetail`, `PermissionCellMark` (new
 * reusable primitive; it sits by the Participate line when Military Campaigns
 * is missing, and after Set destination when Autopilot waypoints is missing).
 */

interface Variant {
  caption: string;
  state: TurnInState;
  write?: WriteState;
  extra?: ReactNode;
  item?: TurnInDetailProps['item'];
  character?: string;
}

/** The popover's surface (`menuStyles.ts`), drawn open and static. */
const menuSurfaceClassName =
  'rounded-xs border border-line bg-panel p-1 text-text shadow-lg shadow-black/50';

const VARIANTS: readonly Variant[] = [
  { caption: 'Signed up', state: 'participating' },
  { caption: 'Granted, not signed up', state: 'notSignedUp', character: 'Orsa Tellemar' },
  { caption: 'Military Campaigns missing', state: 'missing', character: 'Mira Solenne' },
  { caption: 'Military Campaigns dismissed', state: 'dismissed' },
  { caption: 'No active Character', state: 'noCharacter', write: 'noCharacter', character: '' },
  { caption: 'Autopilot waypoints missing', state: 'participating', write: 'missing' },
  {
    caption: 'Autopilot waypoints dismissed (button tooltip names it)',
    state: 'participating',
    write: 'dismissed',
  },
  {
    caption: 'From a BUY order (Open Orders)',
    state: 'participating',
    item: STRATEGIC_INTEL,
    extra: 'Pays you ~950k per 100 over this bid (38,500)',
  },
  {
    caption: 'From Assets',
    state: 'participating',
    extra: 'You hold 340 · ~19.1M turned in',
  },
];

function Surface({ variant, first }: { variant: Variant; first: boolean }) {
  const body = (
    <TurnInDetailBody
      item={variant.item ?? FAILOVER}
      character={variant.character ?? 'Kestrel Vane'}
      state={variant.state}
      write={variant.write}
      extra={variant.extra}
      markLabelled={false}
    />
  );
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-xs font-semibold tracking-widest text-text-dim uppercase">
        {variant.caption}
      </figcaption>
      <div className={cx(menuSurfaceClassName, 'w-fit max-w-full')}>
        {first ? <NewComponent name="TurnInDetail">{body}</NewComponent> : body}
      </div>
    </figure>
  );
}

function Variants() {
  return (
    <div className="mx-auto flex max-w-page flex-col gap-4 px-4 py-4">
      <h1 className="text-lg font-semibold">TurnInDetail: every variant</h1>
      <p className="text-xs text-text-dim">
        Amber marks are PermissionCellMark (new reusable primitive): each opens its own grant
        popover for the named Character.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] items-start gap-4">
        {VARIANTS.map((variant, i) => (
          <Surface key={variant.caption} variant={variant} first={i === 0} />
        ))}
      </div>
    </div>
  );
}

function OpenMark({ openMark }: { openMark: 'participate' | 'write' }) {
  return (
    <div className="mx-auto flex max-w-page flex-col gap-4 px-4 py-4 pb-64">
      <div className={cx(menuSurfaceClassName, 'w-fit max-w-full')}>
        <TurnInDetailBody
          item={FAILOVER}
          character="Mira Solenne"
          state={openMark === 'participate' ? 'missing' : 'participating'}
          write={openMark === 'write' ? 'missing' : 'granted'}
          openMark={openMark}
        />
      </div>
    </div>
  );
}

const meta = {
  title: 'mockups/CampaignTurnIns/Detail',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: turnInShell('/market/appraisal') },
  render: () => <Variants />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Every TurnInDetail variant side by side: Participate states, waypoint Permission states, buy-order and Assets lines. */
export const AllVariants: Story = {};

/** @summary Military Campaigns missing: the mark by the Participate line pressed, its grant popover open for Mira. */
export const MilitaryCampaignsMarkOpen: Story = {
  render: () => <OpenMark openMark="participate" />,
};

/** @summary Autopilot waypoints missing: Set destination stays visible but aria-disabled; the mark after it opens the grant. */
export const WaypointsMarkOpen: Story = { render: () => <OpenMark openMark="write" /> };

/** @summary The variants on a phone: one column. */
export const AllVariantsPhone: Story = { globals: PHONE };
