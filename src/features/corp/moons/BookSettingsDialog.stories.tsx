import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookProvider } from './BookContext';
import { BookSettingsDialog } from './BookSettingsDialog';
import { bookSettingsValue } from './bookSettingsFixture';
import { BOOK_CONTEXT, BOOK_VIEW, CORP_ID } from './corpBookFixture';
import { popSharingFrom } from '../../../../functions/src/popSharing';
import { seedPopSharing } from '../taxBook/popSharingCache';
import { useEffect, useState } from 'react';
import { installFixtureFetch } from '@/storybook/fixtureFetch';

const meta = {
  title: 'corp/BookSettingsDialog',
  component: BookSettingsDialog,
  parameters: { layout: 'fullscreen' },
  args: { open: true, onClose: () => {} },
  decorators: [
    (Story) => (
      <BookProvider value={bookSettingsValue()}>
        <Story />
      </BookProvider>
    ),
  ],
} satisfies Meta<typeof BookSettingsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RefineryRate: Story = {};

export const Billing: Story = { args: { initialTab: 'billing' } };

export const Extractions: Story = { args: { initialTab: 'extractions' } };

export const Sharing: Story = {
  args: { initialTab: 'sharing' },
  decorators: [
    (Story) => {
      const [uninstall] = useState(() =>
        installFixtureFetch([
          {
            path: /^\/corporations\/\d+$/,
            respond: () => ({
              body: { name: 'Sample Corp', ticker: 'SMPL', alliance_id: 99000001 },
            }),
          },
        ])
      );
      useEffect(() => uninstall, [uninstall]);
      const [ready] = useState(() => {
        seedPopSharing(
          CORP_ID,
          popSharingFrom({
            enabled: true,
            defaults: { audiences: [{ kind: 'corp' }, { kind: 'alliance' }] },
            moons: { [Object.values(BOOK_VIEW.extractions)[0]?.moonId ?? 0]: { showOre: true } },
          })
        );
        return true;
      });
      return (
        <BookProvider
          value={{
            ...bookSettingsValue(),
            corporationId: CORP_ID,
            view: BOOK_VIEW,
            names: BOOK_CONTEXT.names as never,
          }}
        >
          {ready && <Story />}
        </BookProvider>
      );
    },
  ],
};

export const Access: Story = { args: { initialTab: 'access' } };

export const TaxContactMailingList: Story = {
  args: { initialTab: 'access' },
  decorators: [
    (Story) => (
      <BookProvider
        value={bookSettingsValue(
          {},
          { taxContact: { kind: 'mailingList', id: 77, name: 'Tax desk' } }
        )}
      >
        <Story />
      </BookProvider>
    ),
  ],
};
