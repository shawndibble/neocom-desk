import type { Meta, StoryObj } from '@storybook/react-vite';
import { CORPS } from './addCorpsFixtures';
import { HiddenCorpsDialog } from './HiddenCorpsDialog';

const meta = {
  title: 'corp/HiddenCorpsDialog',
  component: HiddenCorpsDialog,
  parameters: { layout: 'fullscreen' },
  args: { corps: CORPS.slice(10), onAdd: () => {}, onClose: () => {} },
} satisfies Meta<typeof HiddenCorpsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
