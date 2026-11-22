import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookProvider } from './BookContext';
import { BookSettingsDialog } from './BookSettingsDialog';
import { bookSettingsValue } from './bookSettingsFixture';
import { BOOK_CONTEXT, BOOK_VIEW, CORP_ID } from './corpBookFixture';
import { popSharingFrom } from '../../../../functions/src/popSharing';
import { seedPopSharing } from '../taxBook/popSharingCache';
import { useEffect, useState } from 'react';
import { installFixtureFetch } from '@/storybook/fixtureFetch';

/** @summary The book's settings: dated rates (corp, Guest, Miner, moon, refinery), pricing, grace and late notices. */
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

/** @summary A per-refinery rate on a moon owner's refinery, which has no moon to set a rate on. */
export const RefineryRate: Story = {};

/** @summary Billing tab: trade hub, Ore Form, grace, late notice rules, overdue and divisions. */
export const Billing: Story = { args: { initialTab: 'billing' } };

/** @summary Extractions tab: the chunk-rate fallback and each refinery's measured rate and field expiry. */
export const Extractions: Story = { args: { initialTab: 'extractions' } };

/** @summary Sharing tab: the Pop Sharing switch, the Sharing default and every moon the book handles, each opening its overrides. Saves apart from Save. */
export const Sharing: Story = {
  args: { initialTab: 'sharing' },
  decorators: [
    (Story) => {
      // Seeded before the tab mounts: its first read finds this, so no callable is needed.
      const [uninstall] = useState(() =>
        // The tab asks ESI whether the corporation is in an alliance.
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

/** @summary Access tab: the approval limit, who answers members' tax questions, Automatic sync, reclaiming and deleting the book. */
export const Access: Story = { args: { initialTab: 'access' } };

/** @summary Access tab with a mailing list named to answer members' tax questions (the default is the CEO). */
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
