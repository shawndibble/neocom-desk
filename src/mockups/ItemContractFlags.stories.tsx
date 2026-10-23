import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import {
  BLUEPRINT_ROWS,
  DAMAGE_CONTROL_II,
  DEFAULT_MULTIPLE,
  ITEM_ROWS,
} from './itemContractFlagsFixtures';
import { ItemsBoard, ProposedContractModal, ThresholdSettingsRow } from './itemContractFlagsParts';

/**
 * Flags on the Contracts › Item search board (issue #4773). Markers ride on
 * the Price cell, one filter chip hides what they flag, the detail slide-over
 * says each flag in a sentence, and one Settings row sets the multiple. The
 * board is the real shell, page header, tabs, `FilterBar`, filter chips and
 * `DataTable` with today's columns, fed sample rows; the panel's data loading
 * is not run.
 *
 * New components in this mockup: `ContractFlagNote` (the flag sentence in the
 * slide-over), the second row in Settings (`Flag item contracts at`, a
 * `ChipRow`). "Hide overpriced" is a `FilterChip` inside the existing filter
 * funnel, as Market Browser's Hide bait sells is; the price-cell marker is
 * `BaitFlag`'s look with contract wording.
 */
const meta = {
  title: 'mockups/Item Contract Flags',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/contracts/search/items' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { viewport: { value: 'mobile1', isRotated: false } };
const SEARCH = 'Damage Control II';

/** @summary Today: Damage Control II offers with no flags. */
export const Today: Story = {
  render: () => (
    <ItemsBoard search={SEARCH} rows={ITEM_ROWS} flags={false} threshold={DEFAULT_MULTIPLE} />
  ),
};

/** @summary Today on a phone. */
export const TodayPhone: Story = { ...Today, globals: PHONE };

/** @summary Proposed: two single-item contracts flagged 15x and 12x; the nine-line bundle is not. */
export const Proposed: Story = {
  render: () => <ItemsBoard search={SEARCH} rows={ITEM_ROWS} flags threshold={DEFAULT_MULTIPLE} />,
};

/** @summary Proposed on a phone: the marker sits before the price on the card's title line. */
export const ProposedPhone: Story = { ...Proposed, globals: PHONE };

/** Opens the filter funnel, where Hide overpriced lives. */
const openFunnel: Story['play'] = async ({ canvasElement }) => {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(await body.findByRole('button', { name: /filters/i }));
};

/** @summary The filter funnel open: Hide overpriced beside the existing filters (a popover on desktop, the sheet on a phone). */
export const FunnelOpen: Story = { ...Proposed, play: openFunnel };

/** @summary The filter funnel open on a phone. */
export const FunnelOpenPhone: Story = { ...Proposed, globals: PHONE, play: openFunnel };

/** @summary Hide overpriced on: the flagged rows are gone and "2 overpriced contracts hidden" says so. */
export const HideOverpricedOn: Story = {
  render: () => (
    <ItemsBoard
      search={SEARCH}
      rows={ITEM_ROWS}
      flags
      hideOverpriced
      threshold={DEFAULT_MULTIPLE}
    />
  ),
};

/** @summary Hide overpriced on, phone. */
export const HideOverpricedOnPhone: Story = { ...HideOverpricedOn, globals: PHONE };

/** @summary Option: a dim "9 lines" under the price of a multi-line contract; the row count is in the snapshot, the value split is not. */
export const BundleHint: Story = {
  render: () => (
    <ItemsBoard search={SEARCH} rows={ITEM_ROWS} flags bundleHint threshold={DEFAULT_MULTIPLE} />
  ),
};

/** @summary Blueprint search: a copy asking more than the original is flagged, with its own sentence. */
export const BlueprintCopies: Story = {
  render: () => (
    <ItemsBoard
      search="Damage Control II Blueprint"
      rows={BLUEPRINT_ROWS}
      flags
      threshold={DEFAULT_MULTIPLE}
    />
  ),
};

/** @summary Blueprint search on a phone. */
export const BlueprintCopiesPhone: Story = { ...BlueprintCopies, globals: PHONE };

/** @summary Detail slide-over for the 15x contract: the flag sentence under the price check. */
export const ModalOverpriced: Story = {
  render: () => <ProposedContractModal which="overpriced" />,
};

/** @summary The same slide-over on a phone. */
export const ModalOverpricedPhone: Story = { ...ModalOverpriced, globals: PHONE };

/** @summary Detail slide-over for a copy asking more than the original. */
export const ModalCopy: Story = { render: () => <ProposedContractModal which="copy" /> };

/** @summary Detail slide-over for the padded bundle: the only place that says the searched line is 1% of the value. */
export const ModalBundle: Story = { render: () => <ProposedContractModal which="bundle" /> };

/** @summary Settings › Market: the multiple beside the courier collateral row. */
export const Settings: Story = { render: () => <ThresholdSettingsRow /> };

export { DAMAGE_CONTROL_II };
