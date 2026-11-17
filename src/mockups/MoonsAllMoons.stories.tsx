import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoonsList } from './moonsAllMoonsList';
import { EmptyHistory, MoonPageA } from './moonsAllMoonsPage';
import { ExtractionsRows, OwnerMoons } from './moonsAllMoonsLinks';
import { EMPTY_MOON } from './moonsAllMoonsFixtures';
import { MoonsChrome, Page } from './moonsAllMoonsShared';
import { MOONS_PARAMS, PHONE_GLOBALS } from './corpTaxBookFormat';

/**
 * Corp Tax Book › Moons: a page of every moon, and each moon's full
 * Extractions history (issue #6299). Chosen: list A, moon A. Decisions and
 * today vs proposed: docs/design/mockups/moons-all-moons/README.md.
 *
 * - **List**: one flat sortable table, station under the name.
 * - **Opened moon**: a table of Extractions; a row opens that Extraction's own page.
 * - **Empty history**: a moon whose book started a week ago.
 * - **Links in**: the Extractions tab and the Moon owner page lead here.
 *
 * New components in this mockup: none. A **Moons** tab is an existing `Tabs`
 * item. Everything else is an existing primitive: PageHeader, StatChips,
 * FilterBar, FilterChip, DataTable, Panel, ProgressBar, EmptyState, Pill.
 */
const meta = {
  title: 'mockups/MoonsAllMoons',
  tags: ['!manifest'],
  parameters: { ...MOONS_PARAMS },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { globals: PHONE_GLOBALS } as const;

const listPage = (archivedShown = false) => (
  <Page>
    <MoonsChrome tab="moons" />
    <MoonsList archivedShown={archivedShown} />
  </Page>
);

/** @summary Moons list: flat sortable table, station under each moon, archived stations hidden behind a chip. */
export const ListA: Story = { render: () => listPage() };
/** @summary Moons list in the phone shell: cards, Tax in the corner. */
export const ListAPhone: Story = { ...ListA, ...PHONE };

/** @summary Moons list with Show archived stations on: Archived pills, and a refinery with no Extraction yet ("Moon not known yet"). */
export const ListAArchived: Story = { render: () => listPage(true) };

const moonPage = (body: React.ReactNode) => (
  <Page>
    <MoonsChrome tab="moons" />
    {body}
  </Page>
);

/** @summary Opened moon: Extractions table, newest first; a row opens that Extraction's page. */
export const MoonA: Story = {
  render: () => moonPage(<MoonPageA />),
};
/** @summary Opened moon A in the phone shell. */
export const MoonAPhone: Story = { ...MoonA, ...PHONE };

/** @summary Empty history: one live pop, nothing earlier kept, and why. */
export const EmptyHistoryStory: Story = {
  name: 'Empty history',
  render: () => moonPage(<EmptyHistory moon={EMPTY_MOON} live={EMPTY_MOON.live} />),
};
/** @summary Empty history in the phone shell. */
export const EmptyHistoryPhone: Story = {
  ...EmptyHistoryStory,
  ...PHONE,
  name: 'Empty history (phone)',
};

/** @summary Links in: the Extractions row opens the moon page; the Moon owner page names are real links. */
export const LinksIn: Story = {
  render: () => (
    <Page>
      <ExtractionsRows />
      <OwnerMoons />
    </Page>
  ),
};
/** @summary Links in, phone shell. */
export const LinksInPhone: Story = { ...LinksIn, ...PHONE };
