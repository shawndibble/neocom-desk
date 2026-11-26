import type { Meta, StoryObj } from '@storybook/react-vite';
import { recordOutcome } from '@/engine/corpTaxBook/addCorpsRun';
import { freshRun, midRun } from './addCorpsFixtures';
import { SignInSequenceDialog } from './SignInSequenceDialog';

const meta = {
  title: 'corp/SignInSequenceDialog',
  component: SignInSequenceDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    run: freshRun(),
    showOutcome: true,
    onSignIn: () => Promise.resolve(),
    onStop: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof SignInSequenceDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const First: Story = {};

export const BackFromEve: Story = { args: { run: midRun() } };

export const WrongCharacter: Story = {
  args: {
    run: recordOutcome(midRun(), { kind: 'wrong-character', signedInAs: 'Dax Orlen' }),
  },
};

export const Refused: Story = {
  args: { run: recordOutcome(midRun(), { kind: 'refused', reason: 'not-an-accountant' }) },
};

export const AlertsStep: Story = {
  args: {
    run: recordOutcome(freshRun({ alertsFor: [90000001] }), { kind: 'connected' }),
  },
};
