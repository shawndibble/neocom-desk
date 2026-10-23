import type { Meta, StoryObj } from '@storybook/react-vite';
import { CONFIGURED, INVALID } from './srpSettingsFixtures';
import { FirstTimePage, SrpSettingsPage } from './srpSettingsParts';

/**
 * Corp SRP settings (Director only): on/off, the percent chain, Hull Rules,
 * claim window, Fleet or FC, and the corp-chat link. Fixtures are local to the
 * mockup.
 *
 * New components in this mockup:
 * - `UnsavedChangesBar`: sticky Discard / Save bar while edits are unsaved
 *   (no shared unsaved-changes primitive exists yet); Save waits while a field
 *   is invalid.
 * - `HullSearchResults`: the result list under the add-hull `SearchInput`.
 * Everything else is an existing primitive (Panel, Fields, NativeSelect,
 * IskInput, DataTable, Checkbox, Button, EmptyState). The class caret in the
 * Hull Rules table is a plain button in a `DataTable` cell.
 */
const meta = {
  title: 'mockups/SrpSettings',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { viewport: { value: 'mobile1', isRotated: false } } as const;

/** @summary First-time setup: SRP off, a short explainer and one primary action, Turn on SRP. */
export const FirstTime: Story = { render: () => <FirstTimePage /> };

/** @summary First-time setup in the phone shell. */
export const FirstTimePhone: Story = { ...FirstTime, globals: PHONE };

/** @summary Configured: percents, Cruisers expanded to hulls, a fixed price, Not covered rows muted, add-hull search with results, unsaved-changes bar. New: UnsavedChangesBar, HullSearchResults. */
export const Configured: Story = {
  render: () => <SrpSettingsPage initial={CONFIGURED} dirty searchText="mega" />,
};

/** @summary Configured settings in the phone shell. */
export const ConfiguredPhone: Story = { ...Configured, globals: PHONE };

/** @summary Validation: Killmail percent 140 is out of range and a Pay fixed ISK row is blank; the bar counts the problems and Save waits. */
export const Validation: Story = {
  render: () => <SrpSettingsPage initial={INVALID} />,
};

/** @summary Validation in the phone shell. */
export const ValidationPhone: Story = { ...Validation, globals: PHONE };
