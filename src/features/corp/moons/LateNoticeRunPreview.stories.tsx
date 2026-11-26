import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { usePublicInfo } from '@/stores/publicInfo';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { BookProvider } from './BookContext';
import { CORP_ID, NOTICE_BOOK_CONTEXT } from './corpBookFixture';
import { LateNoticeRun } from './LateNoticeRun';

function SeededRun() {
  useState(() => {
    useActiveCharacter.setState({ activeCharacterId: NOTICE_BOOK_CONTEXT.characterId });
    usePublicInfo.setState({
      byCharacterId: {
        [NOTICE_BOOK_CONTEXT.characterId]: {
          corporationName: 'Ore & Glory',
          allianceName: null,
          corporationId: CORP_ID,
        },
      },
    });
    return null;
  });
  return (
    <BookProvider value={NOTICE_BOOK_CONTEXT}>
      <div className="mx-auto max-w-page px-4 py-4">
        <LateNoticeRun />
      </div>
    </BookProvider>
  );
}

const meta = {
  title: 'corp/LateNoticeRunPreview',
  component: SeededRun,
  parameters: { layout: 'fullscreen', shell: { path: '/corp/moons/late-notices', scopes: [] } },
} satisfies Meta<typeof SeededRun>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Check: Story = {};

export const Send: Story = {
  play: async ({ canvasElement }) => {
    await new Promise((r) => setTimeout(r, 300));
    [...canvasElement.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Continue to send')
      ?.click();
  },
};

export const PhoneDialog: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    await new Promise((r) => setTimeout(r, 300));
    [...canvasElement.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Preview mail')
      ?.click();
  },
};
