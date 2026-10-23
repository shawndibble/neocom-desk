import type { Meta, StoryObj } from '@storybook/react-vite';
import { Overview } from '@/routes/Overview';
import { Inject } from './ScoreTitleInject';
import { findHeaderLine } from './scoreTitleTargets';
import {
  CONTACTS_SCOPES,
  scoreTitleFixtureRoutes,
  seedScoreTitle,
} from './characterScoreTitleFixtures';

/** Issue #4777 on the Overview: the Character header above the widgets. */
const meta = {
  title: 'mockups/OverviewScoreTitle',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: {
      path: '/',
      routes: scoreTitleFixtureRoutes,
      scopes: CONTACTS_SCOPES,
      seed: seedScoreTitle,
    },
  },
  render: () => <Overview />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The Overview today, desktop. */
export const Today: Story = {};

/** @summary The Overview today, phone. */
export const TodayPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Proposed: a line under the Character header's corporation. */
export const Proposed: Story = {
  render: () => (
    <>
      <Overview />
      <Inject find={findHeaderLine} />
    </>
  ),
};

/** @summary Proposed, phone. */
export const ProposedPhone: Story = {
  ...Proposed,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
