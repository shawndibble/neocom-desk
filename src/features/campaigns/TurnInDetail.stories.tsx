import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { menuContentClassName } from '@/components/ui/menuStyles';
import { cx } from '@/lib/cx';
import {
  TurnInDestinationView,
  TurnInDetailView,
  TurnInFigureButton,
  TurnInGlyph,
  TurnInPopover,
} from './TurnInDetail';
import type { DestinationBlock, ParticipateLine } from './turnInContent';
import { FAILOVER, FAILOVER_UNPRICED, PHONE, STRATEGIC_INTEL } from './turnInStoryData';
import { TurnInSampleMark } from './TurnInSampleMark';
import type { TurnInOfferDetail } from './useTurnIns';

/**
 * `TurnInDetail`: the one single-item popover every surface opens on a
 * campaign turn-in, from its own trigger (`TurnInGlyph` after a figure, or the
 * figure itself as `TurnInFigureButton`). Drawn here with every read made
 * (`TurnInDetailView`); the amber marks are `PermissionCellMark`, which
 * `GrantCellMark` wires up in the app.
 */
interface Variant {
  caption: string;
  participate: ParticipateLine;
  destination?: DestinationBlock;
  character?: string;
  offer?: TurnInOfferDetail;
  name?: string;
  surfaceLine?: ReactNode;
}

const WAYPOINTS = 'Autopilot waypoints';

function Detail({ variant, openMark }: { variant: Variant; openMark?: 'participate' | 'write' }) {
  const character = variant.character ?? 'Kestrel Vane';
  const offer = variant.offer ?? FAILOVER;
  return (
    <TurnInDetailView
      name={variant.name ?? 'Shield Failover Report'}
      offer={offer}
      participate={variant.participate}
      characterName={character}
      surfaceLine={variant.surfaceLine}
      participateMark={
        <TurnInSampleMark
          character={character}
          permission="Military Campaigns"
          why={`Lets Neocom Desk see whether ${character} pressed Participate, so it can tell you if this turn-in pays.`}
          defaultOpen={openMark === 'participate'}
        />
      }
      destination={
        <TurnInDestinationView
          systemName={offer.systemName ?? ''}
          block={variant.destination ?? { kind: 'ready' }}
          permissionLabel={WAYPOINTS}
          sending={false}
          outcome={null}
          onSend={() => {}}
          mark={
            <TurnInSampleMark
              character={character}
              permission={WAYPOINTS}
              why={`Lets Neocom Desk set ${character}'s autopilot destination in the EVE client.`}
              defaultOpen={openMark === 'write'}
            />
          }
        />
      }
    />
  );
}

const VARIANTS: readonly Variant[] = [
  { caption: 'Participating', participate: { kind: 'participating' } },
  {
    caption: 'Granted, not participating',
    participate: { kind: 'notParticipating' },
    character: 'Orsa Tellemar',
  },
  {
    caption: 'Military Campaigns missing',
    participate: { kind: 'paysOnlyIf', mark: true },
    character: 'Mira Solenne',
  },
  { caption: 'Military Campaigns dismissed', participate: { kind: 'paysOnlyIf', mark: false } },
  {
    caption: 'No Character',
    participate: { kind: 'paysOnlyIf', mark: false },
    destination: { kind: 'reason', reason: 'noCharacter' },
  },
  {
    caption: 'Autopilot waypoints missing',
    participate: { kind: 'participating' },
    destination: { kind: 'mark' },
  },
  {
    caption: 'Autopilot waypoints dismissed (tooltip names it)',
    participate: { kind: 'participating' },
    destination: { kind: 'reason', reason: 'dismissed' },
  },
  {
    caption: 'LP unpriced',
    participate: { kind: 'participating' },
    offer: FAILOVER_UNPRICED,
  },
  {
    caption: 'With a surface line (a buy order)',
    participate: { kind: 'participating' },
    offer: STRATEGIC_INTEL,
    name: 'Federation Strategic Intel',
    surfaceLine: 'Pays you ~950K per 100 over this bid (38,500)',
  },
  {
    caption: 'With a surface line (Assets)',
    participate: { kind: 'participating' },
    surfaceLine: 'You hold 340 · ~19.1M turned in',
  },
];

function Surface({ children }: { children: ReactNode }) {
  return <div className={cx(menuContentClassName, 'w-fit max-w-full p-0')}>{children}</div>;
}

function Variants() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] items-start gap-4 p-4">
      {VARIANTS.map((variant) => (
        <figure key={variant.caption} className="flex flex-col gap-1.5">
          <figcaption className="text-xs font-semibold tracking-widest text-text-dim uppercase">
            {variant.caption}
          </figcaption>
          <Surface>
            <Detail variant={variant} />
          </Surface>
        </figure>
      ))}
    </div>
  );
}

const meta = {
  title: 'campaigns/TurnInDetail',
  parameters: { layout: 'fullscreen' },
  render: () => <Variants />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Every TurnInDetail variant side by side: each Participate line, each Set destination state, LP unpriced and surface lines. */
export const AllVariants: Story = {};

/** @summary The variants on a phone: one column. */
export const AllVariantsPhone: Story = { globals: PHONE };

/** @summary Military Campaigns missing: the mark by "Pays only if…" pressed, its grant popover open. */
export const MilitaryCampaignsMarkOpen: Story = {
  render: () => (
    <div className="p-4 pb-64">
      <Surface>
        <Detail variant={VARIANTS[2]!} openMark="participate" />
      </Surface>
    </div>
  ),
};

/** @summary Autopilot waypoints missing: Set destination aria-disabled, the mark after it opened. */
export const WaypointsMarkOpen: Story = {
  render: () => (
    <div className="p-4 pb-64">
      <Surface>
        <Detail variant={VARIANTS[5]!} openMark="write" />
      </Surface>
    </div>
  ),
};

/** @summary The glyph trigger after a figure (Assets, Hauling, a buy order), its popover open. */
export const GlyphTrigger: Story = {
  render: () => (
    <div className="p-4 pb-96 text-sm">
      <span className="tabular-nums">19,060,000</span>
      <TurnInPopover
        name="Shield Failover Report"
        defaultOpen
        trigger={<TurnInGlyph name="Shield Failover Report" />}
      >
        <Detail variant={VARIANTS[9]!} />
      </TurnInPopover>
    </div>
  ),
};

/** @summary The figure itself as the trigger, dashed underlined (Appraisal's Turn in column, the Market item). */
export const FigureTrigger: Story = {
  render: () => (
    <div className="p-4 pb-96 text-sm">
      Turn in{' '}
      <TurnInPopover
        name="Shield Failover Report"
        trigger={<TurnInFigureButton name="Shield Failover Report">~60K</TurnInFigureButton>}
      >
        <Detail variant={VARIANTS[0]!} />
      </TurnInPopover>
    </div>
  ),
};
