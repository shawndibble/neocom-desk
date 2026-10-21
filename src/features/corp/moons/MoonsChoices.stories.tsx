import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoonsChoices } from './MoonsChoices';

/** @summary The Moons page of a corporation with no book: three choices side by side (own book, accounting corporation, collect for others). */
const meta = {
  title: 'corp/MoonsSetup',
  component: MoonsChoices,
  parameters: { layout: 'padded' },
  args: { canOwn: true, paste: '', onPaste: () => {}, onChoose: () => {} },
} satisfies Meta<typeof MoonsChoices>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A Director: all three choices on. */
export const Choices: Story = {};

/** @summary A pasted invite link enables Continue. */
export const WithInvite: Story = {
  args: { paste: 'https://neocomdesk.com/corp/moons?invite=abc123DEF456' },
};

/** @summary An officer who is not a Director: the book choices are off and a line says why. */
export const NotDirector: Story = { args: { canOwn: false } };

/** @summary Just left an accounting corporation. */
export const AfterLeaving: Story = { args: { left: true } };

/** @summary The EVE login could not start: a plain sentence above the choices. */
export const WithError: Story = {
  args: { error: 'That invite link was already used. Ask for a new one.' },
};
