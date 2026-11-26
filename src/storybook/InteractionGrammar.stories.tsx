import type { Meta, StoryObj } from '@storybook/react-vite';
import { InteractionGrammar } from './InteractionGrammar';

const meta = {
  title: 'Guides/Interaction grammar',
  component: InteractionGrammar,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof InteractionGrammar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cues: Story = {};
