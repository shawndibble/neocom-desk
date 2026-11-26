import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ActionResult,
  CheckboxField,
  SettingsHint,
  SettingsPanelLoading,
  SettingsScopeHint,
} from './settingsFields';

const meta = {
  title: 'settings/settingsFields',
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hint: Story = {
  render: () => <SettingsHint>Systems you keep off your routes.</SettingsHint>,
};

export const ScopeDevice: Story = { render: () => <SettingsScopeHint scope="device" /> };

function CheckboxDemo({ scope }: { scope?: 'device' }) {
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

export const Checkbox: Story = { render: () => <CheckboxDemo /> };

export const CheckboxDeviceOnly: Story = { render: () => <CheckboxDemo scope="device" /> };

export const ResultSuccess: Story = {
  render: () => <ActionResult kind="success">Saved.</ActionResult>,
};

export const ResultInfo: Story = {
  render: () => (
    <ActionResult kind="info">
      The update is still rolling out. Try again in a few minutes.
    </ActionResult>
  ),
};

export const ResultError: Story = {
  render: () => <ActionResult kind="error">Could not save.</ActionResult>,
};

export const Loading: Story = { render: () => <SettingsPanelLoading title="Market" /> };
