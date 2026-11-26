import type { Meta, StoryObj } from '@storybook/react-vite';
import { CONFIGURED, INVALID } from './srpSettingsFixtures';
import { FirstTimePage, SrpSettingsPage } from './srpSettingsParts';

const meta = {
  title: 'mockups/SrpSettings',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { viewport: { value: 'mobile1', isRotated: false } } as const;

export const FirstTime: Story = { render: () => <FirstTimePage /> };

export const FirstTimePhone: Story = { ...FirstTime, globals: PHONE };

export const Configured: Story = {
  render: () => <SrpSettingsPage initial={CONFIGURED} dirty searchText="mega" />,
};

export const ConfiguredPhone: Story = { ...Configured, globals: PHONE };

export const Validation: Story = {
  render: () => <SrpSettingsPage initial={INVALID} />,
};

export const ValidationPhone: Story = { ...Validation, globals: PHONE };
