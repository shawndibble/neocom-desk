import type { Meta, StoryObj } from '@storybook/react-vite';
import { GrantBanner } from './GrantNote';

const meta = {
  title: 'app/GrantBanner',
  component: GrantBanner,
  tags: ['autodocs'],
  args: {
    characterId: 1,
    endpoints: ['getCharacterAssets'] as const,
    title: 'Assets',
  },
} satisfies Meta<typeof GrantBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Named: Story = { args: { characterName: 'Shawn Dibble' } };
