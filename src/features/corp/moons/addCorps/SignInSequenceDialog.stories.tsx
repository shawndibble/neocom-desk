import type { Meta, StoryObj } from '@storybook/react-vite';
import { recordOutcome } from '@/engine/corpTaxBook/addCorpsRun';
import { freshRun, midRun } from './addCorpsFixtures';
import { SignInSequenceDialog } from './SignInSequenceDialog';

/** @summary Step 3 of Add my other corps: the guided sign-in, one corp at a time. */
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

/** @summary Corp 1 of 12: the character to choose on EVE's login page. */
export const First: Story = {};

/** @summary Back from EVE: the last corp is connected and the dialog is on corp 5, one earlier corp skipped. */
export const BackFromEve: Story = { args: { run: midRun() } };

/** @summary Signed in as the wrong character: nothing connected, the same corp stays current. */
export const WrongCharacter: Story = {
  args: {
    run: recordOutcome(midRun(), { kind: 'wrong-character', signedInAs: 'Dax Orlen' }),
  },
};

/** @summary EVE refused the ledger: said once, then on to the next corp. */
export const Refused: Story = {
  args: { run: recordOutcome(midRun(), { kind: 'refused', reason: 'not-an-accountant' }) },
};
