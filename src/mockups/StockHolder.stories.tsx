import type { Meta, StoryObj } from '@storybook/react-vite';
import { HolderMarketPage } from './stockHolderParts';

/**
 * Stock › market page: which character holds Ready-to-list and Listed stock
 * (#5594). Three ways to say it; today's page is `pages/Market Stock`
 * `One Market`. Rows mix single holders (Warrior II, Medium Shield Extender II)
 * and several holders (Damage Control II ready, Nanite Repair Paste, Antimatter
 * Charge S). The Damage Control II popover is open.
 *
 * New components in this mockup: `HolderPortrait` (16px inline portrait; the
 * smallest CharacterAvatar is 28px), `ListingHereLine` (variant A header),
 * `HolderSummaryLine` (variant C header). The cell treatments are compositions
 * of Popover, Tooltip and CharacterAvatar. Rows are hand-built mock data, not
 * the real page.
 */
const meta = {
  title: 'mockups/Stock holder',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/market/stock' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary A: holder inline in the cell (portrait + name, "2 characters" popover) plus a "Listing here" header line. */
export const VariantA: Story = { render: () => <HolderMarketPage variant="A" /> };
/** @summary A in the phone shell: portrait only. */
export const VariantAPhone: Story = { ...VariantA, globals: phone };

/** @summary B: numbers stay bare; a small portrait stack after each opens the per-character split. No header line. */
export const VariantB: Story = { render: () => <HolderMarketPage variant="B" /> };
/** @summary B in the phone shell. */
export const VariantBPhone: Story = { ...VariantB, globals: phone };

/** @summary C: no new cells; a header summary per character and the Restock cell names who lists. */
export const VariantC: Story = { render: () => <HolderMarketPage variant="C" /> };
/** @summary C in the phone shell. */
export const VariantCPhone: Story = { ...VariantC, globals: phone };
