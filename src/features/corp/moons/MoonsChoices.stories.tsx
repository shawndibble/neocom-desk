import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoonsChoices } from './MoonsChoices';

const meta = {
  title: 'corp/MoonsSetup',
  component: MoonsChoices,
  parameters: { layout: 'padded' },
  args: { canOwn: true, paste: '', onPaste: () => {}, onChoose: () => {} },
} satisfies Meta<typeof MoonsChoices>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Choices: Story = {};

export const WithInvite: Story = {
  args: { paste: 'https://neocomdesk.com/corp/moons?invite=abc123DEF456' },
};

export const NotDirector: Story = { args: { canOwn: false } };

export const AfterLeaving: Story = { args: { left: true } };

export const WithError: Story = {
  args: { error: 'That invite link was already used. Ask for a new one.' },
};
