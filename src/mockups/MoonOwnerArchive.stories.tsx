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

export const MinerLinkName: Story = {
  render: () => (
    <OwnerFrame>
      <MinedPanel link="name" />
    </OwnerFrame>
  ),
};
export const MinerLinkNamePhone: Story = { ...MinerLinkName, ...PHONE };

export const MinerLinkRow: Story = {
  render: () => (
    <OwnerFrame>
      <MinedPanel link="row" />
    </OwnerFrame>
  ),
};
export const MinerLinkRowPhone: Story = { ...MinerLinkRow, ...PHONE };

export const RefineriesDetailOnly: Story = {
  render: () => (
    <OwnerFrame>
      <RefineriesPanel stations={STATIONS} control="detail" />
      <ArchivedSection stations={ARCHIVED} expanded={false} />
    </OwnerFrame>
  ),
};
export const RefineriesDetailOnlyPhone: Story = { ...RefineriesDetailOnly, ...PHONE };

export const RefineriesRowAction: Story = {
  render: () => (
    <OwnerFrame>
      <RefineriesPanel stations={STATIONS} control="row" />
      <ArchivedSection stations={ARCHIVED} expanded={false} />
    </OwnerFrame>
  ),
};
export const RefineriesRowActionPhone: Story = { ...RefineriesRowAction, ...PHONE };

export const StationPage: Story = {
  render: () => (
    <NewComponent name="StationDetail">
      <StationDetail s={ACTIVE_STATION} />
    </NewComponent>
  ),
};
export const StationPagePhone: Story = { ...StationPage, ...PHONE };

export const StationOffered: Story = {
  render: () => <StationDetail s={IDLE_STATION} />,
};
export const StationOfferedPhone: Story = { ...StationOffered, ...PHONE };

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
export const ArchiveConfirmPhone: Story = { ...ArchiveConfirm, ...PHONE };

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
export const ArchivedSectionOpenPhone: Story = { ...ArchivedSectionOpen, ...PHONE };

export const ArchivedEmpty: Story = {
  render: () => (
    <OwnerFrame>
      <RefineriesPanel stations={[ACTIVE_STATION, IDLE_STATION]} control="detail" />
      <ArchivedSection stations={[]} />
    </OwnerFrame>
  ),
};
export const ArchivedEmptyPhone: Story = { ...ArchivedEmpty, ...PHONE };

export const StationArchived: Story = {
  render: () => <StationDetail s={ARCHIVED[0]} archived />,
};
export const StationArchivedPhone: Story = { ...StationArchived, ...PHONE };
