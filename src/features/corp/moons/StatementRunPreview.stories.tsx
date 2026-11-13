import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { usePublicInfo } from '@/stores/publicInfo';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, CORP_ID } from './corpBookFixture';
import { StatementRun } from './StatementRun';

/** The corporation's name the mail is signed with, so the preview renders instead of "Loading…". */
function SeededRun() {
  useState(() => {
    useActiveCharacter.setState({ activeCharacterId: BOOK_CONTEXT.characterId });
    usePublicInfo.setState({
      byCharacterId: {
        [BOOK_CONTEXT.characterId]: {
          corporationName: 'Ore & Glory',
          allianceName: null,
          corporationId: CORP_ID,
        },
      },
    });
    return null;
  });
  return (
    <BookProvider value={BOOK_CONTEXT}>
      <div className="mx-auto max-w-page px-4 py-4">
        <StatementRun />
      </div>
    </BookProvider>
  );
}

/**
 * The Statement run on the sample book. On a desktop the chosen Miner's mail sits
 * beside the step, picked by a labelled "Preview for"; on a phone "Preview mail"
 * opens it in a dialog.
 */
const meta = {
  title: 'corp/StatementRunPreview',
  component: SeededRun,
  parameters: { layout: 'fullscreen', shell: { path: '/corp/moons/statements', scopes: [] } },
} satisfies Meta<typeof SeededRun>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Check step: desktop shows the mail inline; a phone keeps the Preview mail button. */
export const Check: Story = {};

/** @summary Send step: the same inline mail beside the mail-limit notice and Send. */
export const Send: Story = {
  play: async ({ canvasElement }) => {
    await new Promise((r) => setTimeout(r, 300));
    [...canvasElement.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Continue to send')
      ?.click();
  },
};

/** @summary Phone: Preview mail opened, the dialog steps between Miners. */
export const PhoneDialog: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    await new Promise((r) => setTimeout(r, 300));
    [...canvasElement.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Preview mail')
      ?.click();
  },
};
