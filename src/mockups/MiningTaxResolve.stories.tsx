import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui';
import { CONFLICTS_OPEN, CONFLICTS_WAITING } from './miningTaxResolveFixtures';
import { OfficerHeldDay } from './miningTaxResolveAllocation';
import { AFTER_ITEMS, TODAY_ITEMS, proposedItems } from './miningTaxResolveItems';
import {
  OfficerPaidToYou,
  OfficerVerified,
  ResolvePaidChecked,
  ResolvePaidPerson,
} from './miningTaxResolveVerify';
import {
  AfterLedger,
  Balances,
  InlineChoices,
  LeftCorpNotice,
  OfficerKeepBillDialog,
  OfficerNeedsYou,
  OpenedStrip,
  QuietStatusLine,
  ResolveConflict,
  ResolveNotPaying,
  ResolveUncredited,
  TaxContactSetting,
  TaxTabFrame,
  TodayCompareDialog,
} from './miningTaxResolveParts';

const meta = {
  title: 'mockups/MiningTaxResolve',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/mining/tax' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
const officer = { parameters: { shell: { path: '/corp/moons/miners' } } };

function ProposedTab() {
  return (
    <TaxTabFrame>
      <OpenedStrip items={proposedItems()} />
      <Balances conflicts={CONFLICTS_OPEN} />
    </TaxTabFrame>
  );
}

export const Today: Story = {
  render: () => (
    <TaxTabFrame>
      <OpenedStrip items={TODAY_ITEMS} />
      <Balances conflicts={CONFLICTS_OPEN} />
    </TaxTabFrame>
  ),
};

export const TodayCompare: Story = {
  render: () => (
    <>
      <ProposedTab />
      <TodayCompareDialog />
    </>
  ),
};

export const A_Inline: Story = {
  render: () => {
    const items = proposedItems();
    items[0] = { ...items[0], action: <InlineChoices /> };
    return (
      <TaxTabFrame>
        <OpenedStrip items={items} />
        <Balances conflicts={CONFLICTS_OPEN} />
      </TaxTabFrame>
    );
  },
};

export const B_Uncredited: Story = {
  render: () => (
    <>
      <ProposedTab />
      <ResolveUncredited />
    </>
  ),
};

export const B_UncreditedPhone: Story = { ...B_Uncredited, ...phone };

export const B_Conflict: Story = {
  render: () => (
    <>
      <ProposedTab />
      <ResolveConflict />
    </>
  ),
};

export const B_NotPaying: Story = {
  render: () => (
    <>
      <ProposedTab />
      <ResolveNotPaying />
    </>
  ),
};

export const After: Story = {
  render: () => (
    <TaxTabFrame>
      <OpenedStrip items={AFTER_ITEMS} />
      <QuietStatusLine />
      <Balances conflicts={CONFLICTS_WAITING} />
      <AfterLedger />
    </TaxTabFrame>
  ),
};

export const AfterPhone: Story = { ...After, ...phone };

export const LeftTheCorp: Story = {
  render: () => (
    <TaxTabFrame>
      <LeftCorpNotice />
      <Balances conflicts={CONFLICTS_WAITING} />
    </TaxTabFrame>
  ),
};

export const OfficerQueue: Story = {
  ...officer,
  render: () => (
    <div className="mx-auto max-w-page px-4 py-4">
      <OfficerNeedsYou />
    </div>
  ),
};

export const OfficerQueuePhone: Story = { ...OfficerQueue, ...phone };

export const OfficerKeepBill: Story = {
  ...officer,
  render: () => (
    <>
      <div className="mx-auto max-w-page px-4 py-4">
        <OfficerNeedsYou />
      </div>
      <OfficerKeepBillDialog />
    </>
  ),
};

export const OfficerContact: Story = {
  ...officer,
  render: () => (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <TaxContactSetting />
      <Button variant="primary">Save</Button>
    </div>
  ),
};

export const PaidChecked: Story = {
  render: () => (
    <>
      <ProposedTab />
      <ResolvePaidChecked />
    </>
  ),
};

export const PaidCheckedPhone: Story = { ...PaidChecked, ...phone };

export const PaidToPerson: Story = {
  render: () => (
    <>
      <ProposedTab />
      <ResolvePaidPerson />
    </>
  ),
};

export const OfficerChecked: Story = {
  ...officer,
  render: () => (
    <div className="mx-auto max-w-page px-4 py-4">
      <OfficerVerified />
    </div>
  ),
};

export const OfficerCheckedPhone: Story = { ...OfficerChecked, ...phone };

export const CeoPaidToYou: Story = {
  ...officer,
  render: () => (
    <div className="mx-auto max-w-page px-4 py-4">
      <OfficerPaidToYou />
    </div>
  ),
};

export const OfficerHeld: Story = {
  ...officer,
  render: () => (
    <div className="mx-auto max-w-page px-4 py-4">
      <OfficerHeldDay />
    </div>
  ),
};
