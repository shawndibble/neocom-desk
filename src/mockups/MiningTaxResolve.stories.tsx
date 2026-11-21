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

/**
 * Mining › Tax: every problem the tab reports gets the same five possible outcomes, split by
 * who has to agree, and only the ones that apply are offered — self-service first.
 *
 *   Settle it yourself: Pay it · Fix my records · Not paying (hide it)
 *   Ask the corporation: I already paid (send proof) · I don't owe this (ask them to change it)
 *
 * Two ways to offer them: A puts the likeliest outcome on the row with the rest in a menu;
 * B gives each problem one Resolve button that opens all of its outcomes with what each one
 * does. After the pilot answers, the problem leaves the attention strip for a quiet line, and
 * only comes back when an officer hands it back — with what to do next.
 *
 * New components in this mockup: `ResolveOptions` (A's button and menu), `ResolveDialog` (B),
 * `QuietStatusLine`, `LeftCorpNotice`, `QueueCard: won't pay` (a new kind on the officer's
 * existing card), `RequiredNextStep` (in the officer's keep-the-bill dialog) and
 * `TaxContactSetting`; and for the wallet check, `WalletCheck` (in the pilot's dialog and on
 * every officer card) and `AutoCreditedLine`. `AttentionStrip`, `OwedBalances`, `DataTable`, `Modal`, `Pill`, `Radio`
 * and the rest are the real components.
 */
const meta = {
  title: 'mockups/MiningTaxResolve',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/mining/tax' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
const officer = { parameters: { shell: { path: '/corp/moons/miners' } } };

/** The tab with Resolve on each problem, as the backdrop behind B's dialogs. */
function ProposedTab() {
  return (
    <TaxTabFrame>
      <OpenedStrip items={proposedItems()} />
      <Balances conflicts={CONFLICTS_OPEN} />
    </TaxTabFrame>
  );
}

/** @summary Today: the strip opened. Both items end in advice, neither has a control to press. */
export const Today: Story = {
  render: () => (
    <TaxTabFrame>
      <OpenedStrip items={TODAY_ITEMS} />
      <Balances conflicts={CONFLICTS_OPEN} />
    </TaxTabFrame>
  ),
};

/** @summary Today: Compare with the book on a day billed at a higher rate. Only Close. */
export const TodayCompare: Story = {
  render: () => (
    <>
      <ProposedTab />
      <TodayCompareDialog />
    </>
  ),
};

/** @summary A · Inline: the likeliest outcome is the row's button; the rest are one menu away. New component: ResolveOptions. */
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

/** @summary B · Resolve, uncredited donations: "I already paid" preselected, the proof already filled in. New component: ResolveDialog. */
export const B_Uncredited: Story = {
  render: () => (
    <>
      <ProposedTab />
      <ResolveUncredited />
    </>
  ),
};

/** @summary B · Resolve, uncredited donations, phone: the dialog as a sheet. */
export const B_UncreditedPhone: Story = { ...B_Uncredited, ...phone };

/** @summary B · Resolve, a Conflict: "Fix my records" with what it moves, beside telling the corp. New component: ResolveDialog. */
export const B_Conflict: Story = {
  render: () => (
    <>
      <ProposedTab />
      <ResolveConflict />
    </>
  ),
};

/** @summary B · Resolve, a day billed at a higher rate: "Not paying", with the optional reason ticked. New component: ResolveDialog. */
export const B_NotPaying: Story = {
  render: () => (
    <>
      <ProposedTab />
      <ResolveNotPaying />
    </>
  ),
};

/** @summary After: only the bill an officer handed back still needs the pilot, with their instructions. The rest is one quiet line. New component: QuietStatusLine. */
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

/** @summary After, phone. */
export const AfterPhone: Story = { ...After, ...phone };

/** @summary A corporation the pilot has left: one notice, pay or stop showing it. New component: LeftCorpNotice. */
export const LeftTheCorp: Story = {
  render: () => (
    <TaxTabFrame>
      <LeftCorpNotice />
      <Balances conflicts={CONFLICTS_WAITING} />
    </TaxTabFrame>
  ),
};

/** @summary Officer · Needs you: the pilot's proof, dispute and won't-pay as cards; won't-pay reuses the leaver's two answers. New component: QueueCard: won't pay. */
export const OfficerQueue: Story = {
  ...officer,
  render: () => (
    <div className="mx-auto max-w-page px-4 py-4">
      <OfficerNeedsYou />
    </div>
  ),
};

/** @summary Officer · Needs you, phone. */
export const OfficerQueuePhone: Story = { ...OfficerQueue, ...phone };

/** @summary Officer · Keep the bill: what the member should do next is required, and shown to them word for word. New component: RequiredNextStep. */
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

/** @summary Officer · Book settings: who gets the EVE mail when a member asks — CEO by default, or a mailing list, or named officers. New component: TaxContactSetting. */
export const OfficerContact: Story = {
  ...officer,
  render: () => (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <TaxContactSetting />
      <Button variant="primary">Save</Button>
    </div>
  ),
};

/** @summary I paid · checked: one donation was in the corp wallet and is credited on the spot; only the other goes to an officer, with the search attached. New component: WalletCheck. */
export const PaidChecked: Story = {
  render: () => (
    <>
      <ProposedTab />
      <ResolvePaidChecked />
    </>
  ),
};

/** @summary I paid · checked, phone. */
export const PaidCheckedPhone: Story = { ...PaidChecked, ...phone };

/** @summary I paid · to a person: the pilot picks the payment; it went to the CEO, who is asked to confirm from his own wallet. Another corporation is flagged too. New component: WalletCheck: which payment. */
export const PaidToPerson: Story = {
  render: () => (
    <>
      <ProposedTab />
      <ResolvePaidPerson />
    </>
  ),
};

/** @summary Officer · every "says they paid" arrives checked: credited automatically, found in an uncounted division, not in the corp wallet, or too old to check. New components: AutoCreditedLine, WalletCheck. */
export const OfficerChecked: Story = {
  ...officer,
  render: () => (
    <div className="mx-auto max-w-page px-4 py-4">
      <OfficerVerified />
    </div>
  ),
};

/** @summary Officer · checked, phone. */
export const OfficerCheckedPhone: Story = { ...OfficerChecked, ...phone };

/** @summary The CEO · tax paid to him personally, checked in his own wallet: record it as tax in one click. New component: WalletCheck: paid to you. */
export const CeoPaidToYou: Story = {
  ...officer,
  render: () => (
    <div className="mx-auto max-w-page px-4 py-4">
      <OfficerPaidToYou />
    </div>
  ),
};

/** @summary Officer · the card says where the member's money landed and which day is held until they answer. */
export const OfficerHeld: Story = {
  ...officer,
  render: () => (
    <div className="mx-auto max-w-page px-4 py-4">
      <OfficerHeldDay />
    </div>
  ),
};
