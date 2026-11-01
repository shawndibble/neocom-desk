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

/**
 * Phone redesign of the two views that read badly at 390px: the Moon owners
 * list and the Needs you panel. Two options each; screenshot at 390 only.
 *
 * New components in this mockup: none; these are layouts of existing primitives
 * (Panel, Pill, Button), so no dashed boxes.
 */
const meta = {
  title: 'mockups/MoonsAddCorpsPhone',
  tags: ['!manifest'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Moon owners, option 1: name and what they are owed lead, Pay under the figure, detail on the row. */
export const OwnersFigures: Story = {
  render: () => (
    <PhonePanel title="Moon owners" meta="4 moon owners">
      <OwnersFiguresFirst owners={OWNERS} />
    </PhonePanel>
  ),
};

/** @summary Moon owners, option 2: name line with Pay, then an aligned Owed / Mined / Rates grid. */
export const OwnersGrid: Story = {
  render: () => (
    <PhonePanel title="Moon owners" meta="4 moon owners">
      <OwnersFigureGrid owners={OWNERS} />
    </PhonePanel>
  ),
};

/** @summary Needs you, option 1: small action at the right of the name line, state pill under it. */
export const AttentionRight: Story = {
  render: () => (
    <PhonePanel title="Needs you (4)" meta="8 of 12 connected">
      <AttentionActionRight items={ATTENTION} />
    </PhonePanel>
  ),
};

/** @summary Needs you, option 2: state as a left rule, pill beside the name, action at the foot. */
export const AttentionRule: Story = {
  render: () => (
    <PhonePanel title="Needs you (4)" meta="8 of 12 connected">
      <AttentionLeftRule items={ATTENTION} />
    </PhonePanel>
  ),
};

/** @summary Option 1 under stress: a 55-character name and an 11-digit amount owed. */
export const OwnersFiguresStress: Story = {
  render: () => (
    <PhonePanel title="Moon owners" meta="3 moon owners">
      <OwnersFiguresFirst owners={STRESS} />
    </PhonePanel>
  ),
};

/** @summary Option 1b, the stacked version of Figures first, under the same stress. */
export const OwnersStackedStress: Story = {
  render: () => (
    <PhonePanel title="Moon owners" meta="3 moon owners">
      <OwnersStacked owners={STRESS} />
    </PhonePanel>
  ),
};

/** @summary Option 1b with the normal sample rows. */
export const OwnersStacked1b: Story = {
  render: () => (
    <PhonePanel title="Moon owners" meta="4 moon owners">
      <OwnersStacked owners={OWNERS} />
    </PhonePanel>
  ),
};
