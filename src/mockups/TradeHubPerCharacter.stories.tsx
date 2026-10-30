import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router-dom';
import { Settings } from '@/routes/Settings';
import { NewComponent } from './NewComponent';
import { FOUR, ONE, type Variant } from './tradeHubFixtures';
import { TradeHubSettingsPage } from './tradeHubParts';

/**
 * Issue #5593: a Trade Hub per character, with the account Trade Hub as the
 * default for new characters. Three ways to lay it out in Settings › Market
 * defaults. The proposal is drawn inside a copy of the Settings frame (header
 * and rail from the real components); the sibling Market defaults controls are
 * summarised in one line, not redrawn. `Today` is the real page.
 *
 * New components in this mockup: `CharacterHubRows` (portrait, name, hub select
 * per character, shared by A, B and C). Everything else is an existing primitive
 * (Panel, Field, Select, Button, Collapse, Modal, CharacterAvatar).
 */
const meta = {
  title: 'mockups/TradeHubPerCharacter',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { viewport: { value: 'mobile1', isRotated: false } } as const;

const page = (variant: Variant, extra: { open?: boolean; one?: boolean } = {}): Story => ({
  render: () => (
    <NewComponent name="CharacterHubRows">
      <TradeHubSettingsPage
        variant={variant}
        open={extra.open}
        characters={extra.one ? ONE : FOUR}
      />
    </NewComponent>
  ),
});

/** @summary Today: the real Settings › Market defaults (one account-wide Trade Hub). */
export const Today: Story = {
  parameters: { shell: { path: '/settings/market' } },
  render: () => (
    <Routes>
      <Route path="settings/*" element={<Settings />} />
    </Routes>
  ),
};

/** @summary Today in the phone shell. */
export const TodayPhone: Story = { ...Today, globals: PHONE };

/** @summary A: inline list. Default select, then a "Per character" list always shown with Apply default to all in its header. New: CharacterHubRows. */
export const A: Story = page('A');
/** @summary A in the phone shell. */
export const APhone: Story = { ...A, globals: PHONE };

/** @summary B: collapsed. Default select plus a one-line summary ("2 on Jita, 1 on Hek, 1 on Amarr") and a "Set per character" disclosure; closed by default. New: CharacterHubRows. */
export const B: Story = page('B');
/** @summary B with the disclosure open. */
export const BOpen: Story = {
  render: () => (
    <NewComponent name="CharacterHubRows">
      <TradeHubSettingsPage variant="B" open />
    </NewComponent>
  ),
};
/** @summary B open, phone shell. */
export const BOpenPhone: Story = { ...BOpen, globals: PHONE };

/** @summary C: dialog. Default select with a "Hub per character" button; the list and Apply default to all live in a Modal (shown open). New: CharacterHubRows. */
export const C: Story = page('C', { open: true });
/** @summary C in the phone shell. */
export const CPhone: Story = { ...C, globals: PHONE };
/** @summary C with the dialog closed: the only footprint is one extra button. */
export const CClosed: Story = page('C');

/** @summary One character (the empty state): just "Trade Hub", exactly today's control; no per-character UI in any variant. */
export const SingleCharacter: Story = page('A', { one: true });
