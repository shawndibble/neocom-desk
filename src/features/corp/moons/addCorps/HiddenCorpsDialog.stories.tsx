import type { Meta, StoryObj } from '@storybook/react-vite';
import { CORPS } from './addCorpsFixtures';
import { HiddenCorpsDialog } from './HiddenCorpsDialog';

/** @summary Corps hidden with Don't ask again, opened only from the picker footer; Add brings one back. */
const meta = {
  title: 'corp/HiddenCorpsDialog',
  component: HiddenCorpsDialog,
  parameters: { layout: 'fullscreen' },
  args: { corps: CORPS.slice(10), onAdd: () => {}, onClose: () => {} },
} satisfies Meta<typeof HiddenCorpsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Two hidden corps. */
export const Default: Story = {};
