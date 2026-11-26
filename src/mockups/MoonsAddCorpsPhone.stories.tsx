import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AttentionActionRight,
  AttentionLeftRule,
  OwnersFigureGrid,
  OwnersFiguresFirst,
  OwnersStacked,
  PhonePanel,
} from './moonsAddCorpsPhoneParts';
import { ATTENTION, OWNERS, STRESS } from './moonsAddCorpsPhoneFixtures';

const meta = {
  title: 'mockups/MoonsAddCorpsPhone',
  tags: ['!manifest'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnersFigures: Story = {
  render: () => (
    <PhonePanel title="Moon owners" meta="4 moon owners">
      <OwnersFiguresFirst owners={OWNERS} />
    </PhonePanel>
  ),
};

export const OwnersGrid: Story = {
  render: () => (
    <PhonePanel title="Moon owners" meta="4 moon owners">
      <OwnersFigureGrid owners={OWNERS} />
    </PhonePanel>
  ),
};

export const AttentionRight: Story = {
  render: () => (
    <PhonePanel title="Needs you (4)" meta="8 of 12 connected">
      <AttentionActionRight items={ATTENTION} />
    </PhonePanel>
  ),
};

export const AttentionRule: Story = {
  render: () => (
    <PhonePanel title="Needs you (4)" meta="8 of 12 connected">
      <AttentionLeftRule items={ATTENTION} />
    </PhonePanel>
  ),
};

export const OwnersFiguresStress: Story = {
  render: () => (
    <PhonePanel title="Moon owners" meta="3 moon owners">
      <OwnersFiguresFirst owners={STRESS} />
    </PhonePanel>
  ),
};

export const OwnersStackedStress: Story = {
  render: () => (
    <PhonePanel title="Moon owners" meta="3 moon owners">
      <OwnersStacked owners={STRESS} />
    </PhonePanel>
  ),
};

export const OwnersStacked1b: Story = {
  render: () => (
    <PhonePanel title="Moon owners" meta="4 moon owners">
      <OwnersStacked owners={OWNERS} />
    </PhonePanel>
  ),
};
