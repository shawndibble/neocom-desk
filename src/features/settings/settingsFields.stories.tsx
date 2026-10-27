import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ActionResult,
  CheckboxField,
  SettingsHint,
  SettingsPanelLoading,
  SettingsScopeHint,
} from './settingsFields';

/**
 * The shared Settings building blocks: hint, scope line, lone checkbox, action result, loading panel.
 *
 * @summary Settings panel building blocks.
 */
const meta = {
  title: 'settings/settingsFields',
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The paragraph above a form. */
export const Hint: Story = {
  render: () => <SettingsHint>Systems you keep off your routes.</SettingsHint>,
};

/** @summary Scope readout (§6c): synced panel line. */
export const ScopeSynced: Story = { render: () => <SettingsScopeHint scope="synced" /> };

/** @summary Scope readout (§6c): device-only panel line. */
export const ScopeDevice: Story = { render: () => <SettingsScopeHint scope="device" /> };

function CheckboxDemo({ scope }: { scope?: 'synced' | 'device' }) {
  const [on, setOn] = useState(true);
  return (
    <CheckboxField
      id="story-checkbox"
      label="Continue sessions across midnight"
      hint="Adds the new EVE day to the same session."
      checked={on}
      onChange={() => setOn(!on)}
      scope={scope}
    />
  );
}

/** @summary Lone checkbox row. */
export const Checkbox: Story = { render: () => <CheckboxDemo /> };

/** @summary Lone checkbox row whose scope differs from its panel. */
export const CheckboxDeviceOnly: Story = { render: () => <CheckboxDemo scope="device" /> };

/** @summary Success line after a button press. */
export const ResultSuccess: Story = {
  render: () => <ActionResult kind="success">Saved.</ActionResult>,
};

/** @summary Neutral line after a button press: nothing went wrong, nothing happened yet. */
export const ResultInfo: Story = {
  render: () => (
    <ActionResult kind="info">
      The update is still rolling out. Try again in a few minutes.
    </ActionResult>
  ),
};

/** @summary Error line after a button press. */
export const ResultError: Story = {
  render: () => <ActionResult kind="error">Could not save.</ActionResult>,
};

/** @summary Panel while stores hydrate. */
export const Loading: Story = { render: () => <SettingsPanelLoading title="Market" /> };
