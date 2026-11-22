import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { NewComponent } from './NewComponent';
import { ACTIVE_STATION, ARCHIVED, GONE_STATION, IDLE_STATION } from './moonOwnerArchiveFixtures';
import {
  ArchivedSection,
  MinedPanel,
  OwnerFrame,
  RefineriesPanel,
  StationDetail,
} from './moonOwnerArchiveParts';

/**
 * Corp Tax Book › Moon owner page (#6298): miner names open Miner detail, a refinery
 * opens its own page, and a gone refinery can be archived. Decisions and the one
 * archive-offer rule: docs/design/mockups/moon-owner-archive/README.md.
 *
 * New components in this mockup: `StationDetail` (a refinery's own page: moon, Extractions,
 * mining history), `ArchivedSection` (a collapsible panel of archived refineries with Restore)
 * and `OfferPill` (the amber "gone" / "no Extraction" hint). Everything else is an existing
 * primitive (Panel, DataTable, CollapsiblePanel, Pill, StatChip, ConfirmDialog).
 */
const meta = {
  title: 'mockups/MoonOwnerArchive',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/corp/moons/moon-owners/98' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { globals: { viewport: { value: 'mobile1', isRotated: false } } } as const;
const STATIONS = [ACTIVE_STATION, IDLE_STATION, GONE_STATION];

const stack = (children: React.ReactNode) => <div className="space-y-4">{children}</div>;

/** @summary Miner link A (recommended): the miner name is the accent link to Miner detail; other cells stay text. */
export const MinerLinkName: Story = {
  render: () => (
    <OwnerFrame>
      <MinedPanel link="name" />
    </OwnerFrame>
  ),
};
/** @summary Miner link A in the phone shell. */
export const MinerLinkNamePhone: Story = { ...MinerLinkName, ...PHONE };

/** @summary Miner link B: the whole row navigates, trailing caret on the right; names stay text. */
export const MinerLinkRow: Story = {
  render: () => (
    <OwnerFrame>
      <MinedPanel link="row" />
    </OwnerFrame>
  ),
};
/** @summary Miner link B in the phone shell. */
export const MinerLinkRowPhone: Story = { ...MinerLinkRow, ...PHONE };

/** @summary Refineries A (recommended): names are links to the refinery; the pencil stays; an amber pill hints at a gone one; Archive lives on the refinery's page. */
export const RefineriesDetailOnly: Story = {
  render: () => (
    <OwnerFrame>
      <RefineriesPanel stations={STATIONS} control="detail" />
      <ArchivedSection stations={ARCHIVED} expanded={false} />
    </OwnerFrame>
  ),
};
/** @summary Refineries A in the phone shell. */
export const RefineriesDetailOnlyPhone: Story = { ...RefineriesDetailOnly, ...PHONE };

/** @summary Refineries B: the same list, plus an Archive text action on the rows that are offered. */
export const RefineriesRowAction: Story = {
  render: () => (
    <OwnerFrame>
      <RefineriesPanel stations={STATIONS} control="row" />
      <ArchivedSection stations={ARCHIVED} expanded={false} />
    </OwnerFrame>
  ),
};
/** @summary Refineries B in the phone shell. */
export const RefineriesRowActionPhone: Story = { ...RefineriesRowAction, ...PHONE };

/** @summary The refinery's own page, healthy: moon (links to the Moons page), Extractions, mining history, a plain ghost Archive in the header. New component: StationDetail. */
export const StationPage: Story = {
  render: () => (
    <NewComponent name="StationDetail">
      <StationDetail s={ACTIVE_STATION} />
    </NewComponent>
  ),
};
/** @summary The refinery's own page in the phone shell. */
export const StationPagePhone: Story = { ...StationPage, ...PHONE };

/** @summary A refinery with no Extraction for 71 days: a hint strip says why, and Archive becomes the accent button. */
export const StationOffered: Story = {
  render: () => <StationDetail s={IDLE_STATION} />,
};
/** @summary The offered refinery in the phone shell. */
export const StationOfferedPhone: Story = { ...StationOffered, ...PHONE };

/** @summary Archive confirm: names what stays and that Restore is one press. */
export const ArchiveConfirm: Story = {
  render: () => (
    <>
      <StationDetail s={GONE_STATION} />
      <ConfirmDialog
        open
        title="Archive Kestrel Drill 04?"
        body="It leaves the Refineries list and shows under Archived. Its Extractions, mining rows, labels and every Late notice stay exactly as they are. You can restore it any time."
        actionLabel="Archive"
        onConfirm={async () => undefined}
        onClose={() => undefined}
      />
    </>
  ),
};
/** @summary Archive confirm in the phone shell. */
export const ArchiveConfirmPhone: Story = { ...ArchiveConfirm, ...PHONE };

/** @summary After archiving: the Refineries list is shorter and Archived (2) is open, each row with when, who, why and Restore. New component: ArchivedSection. */
export const ArchivedSectionOpen: Story = {
  render: () => (
    <OwnerFrame>
      <RefineriesPanel stations={[ACTIVE_STATION, IDLE_STATION]} control="detail" />
      <NewComponent name="ArchivedSection">
        {stack(<ArchivedSection stations={ARCHIVED} />)}
      </NewComponent>
    </OwnerFrame>
  ),
};
/** @summary The Archived section in the phone shell. */
export const ArchivedSectionOpenPhone: Story = { ...ArchivedSectionOpen, ...PHONE };

/** @summary Empty Archived: the section stays for officers (so Restore has a home) with one line of advice. */
export const ArchivedEmpty: Story = {
  render: () => (
    <OwnerFrame>
      <RefineriesPanel stations={[ACTIVE_STATION, IDLE_STATION]} control="detail" />
      <ArchivedSection stations={[]} />
    </OwnerFrame>
  ),
};
/** @summary Empty Archived in the phone shell. */
export const ArchivedEmptyPhone: Story = { ...ArchivedEmpty, ...PHONE };

/** @summary An archived refinery's page: still readable, banner explains, Restore replaces Archive. */
export const StationArchived: Story = {
  render: () => <StationDetail s={ARCHIVED[0]} archived />,
};
/** @summary An archived refinery's page in the phone shell. */
export const StationArchivedPhone: Story = { ...StationArchived, ...PHONE };
