import type { Meta, StoryObj } from '@storybook/react-vite';
import { Characters } from '@/routes/Characters';
import { Inject } from './ScoreTitleInject';
import { findCardLines, findCharactersColumn, findCharactersPicker } from './scoreTitleTargets';
import {
  CONTACTS_SCOPES,
  scoreTitleFixtureRoutes,
  seedScoreTitle,
} from './characterScoreTitleFixtures';

/** Issue #4777 on the Characters page: card view and table view. */
const meta = {
  title: 'mockups/CharactersScoreTitle',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: {
      path: '/characters',
      routes: scoreTitleFixtureRoutes,
      scopes: CONTACTS_SCOPES,
      seed: seedScoreTitle,
    },
  },
  render: () => <Characters />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The Characters page today, desktop. */
export const Today: Story = {};

/** @summary The Characters page today, phone. */
export const TodayPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Proposed, cards: a line under corporation and alliance. Orsa (0 points, no title) shows nothing new. */
export const Proposed: Story = {
  render: () => (
    <>
      <Characters />
      <Inject find={findCardLines} />
    </>
  ),
};

/** @summary Proposed cards, phone. */
export const ProposedPhone: Story = {
  ...Proposed,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Proposed, table view: an optional Title / Score column after Name (shown on here; off by default). */
export const ProposedTable: Story = {
  render: () => (
    <>
      <Characters />
      <Inject find={findCharactersColumn} />
    </>
  ),
};

/** @summary Proposed table, phone. */
export const ProposedTablePhone: Story = {
  ...ProposedTable,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Proposed: the table's Columns menu gains Title / Score, unchecked by default. */
export const ProposedPicker: Story = {
  render: () => (
    <>
      <Characters />
      <Inject find={findCharactersPicker} />
    </>
  ),
};

/** @summary Proposed picker, phone. */
export const ProposedPickerPhone: Story = {
  ...ProposedPicker,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
