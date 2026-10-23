import type { Meta, StoryObj } from '@storybook/react-vite';
import { Contacts } from '@/routes/Contacts';
import { Inject } from './ScoreTitleInject';
import { findContactsColumn, findContactsPicker } from './scoreTitleTargets';
import {
  CONTACTS_SCOPES,
  scoreTitleFixtureRoutes,
  seedScoreTitle,
} from './characterScoreTitleFixtures';

/**
 * Issue #4777 on the Contacts page: the page as it ships today, for the
 * today-vs-proposed table.
 */
const meta = {
  title: 'mockups/ContactsScoreTitle',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: {
      path: '/contacts',
      routes: scoreTitleFixtureRoutes,
      scopes: CONTACTS_SCOPES,
      seed: seedScoreTitle,
    },
  },
  render: () => <Contacts />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Contacts today, desktop. */
export const Today: Story = {};

/** @summary Contacts today, phone. */
export const TodayPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/**
 * @summary Proposed: an optional Title / Score column after Corp / Alliance (shown on here; off by default).
 * Pell Ashgrove (0 points, no title) and the corporation and alliance rows show a dash.
 */
export const Proposed: Story = {
  render: () => (
    <>
      <Contacts />
      <Inject find={findContactsColumn} />
    </>
  ),
};

/** @summary Proposed, phone: the column joins each row's meta line. */
export const ProposedPhone: Story = {
  ...Proposed,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Proposed: the existing Columns menu gains Title / Score, unchecked by default. */
export const ProposedPicker: Story = {
  render: () => (
    <>
      <Contacts />
      <Inject find={findContactsPicker} />
    </>
  ),
};

/** @summary Proposed picker, phone. */
export const ProposedPickerPhone: Story = {
  ...ProposedPicker,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
