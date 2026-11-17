import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoonsList } from './moonsAllMoonsList';
import { EmptyHistory, MoonPageA, MoonPageB } from './moonsAllMoonsPage';
import { ExtractionsRows, OwnerMoons } from './moonsAllMoonsLinks';
import { EMPTY_MOON } from './moonsAllMoonsFixtures';
import { MoonsChrome, Page } from './moonsAllMoonsShared';
import { MOONS_PARAMS, PHONE_GLOBALS } from './corpTaxBookFormat';

/**
 * Corp Tax Book › Moons: a page of every moon, and each moon's full history
 * (issue #6299). Decisions and today vs proposed:
 * docs/design/mockups/moons-all-moons/README.md.
 *
 * - **List**: A is one flat sortable table (station under the name); B folds
 *   the same rows under their refinery.
 * - **Opened moon**: A is a table of pops whose rows open to make-up and
 *   miners; B is one card per pop with its own Started / Pop / Fractured /
 *   Field gone timeline.
 * - **Empty history**: a moon whose book started a week ago.
 * - **Links in**: Extractions rows and the Moon owner page lead here.
 *
 * New components in this mockup: a **Moons** tab in the page's tab bar (an
 * existing `Tabs` item, not a new primitive); variant B's `PopCard` and
 * `StationHeader` (hand-built from Panel and the DataTable group header);
 * `PopDetail` (the expanded row, a small two-column read). Every other piece is
 * an existing primitive: PageHeader, StatChips, FilterBar, FilterChip,
 * DataTable, Panel, ProgressBar, EmptyState, Pill.
 */
const meta = {
  title: 'mockups/MoonsAllMoons',
  tags: ['!manifest'],
  parameters: { ...MOONS_PARAMS },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { globals: PHONE_GLOBALS } as const;

const listPage = (variant: 'A' | 'B', archivedShown = false) => (
  <Page>
    <MoonsChrome tab="moons" />
    <MoonsList variant={variant} archivedShown={archivedShown} />
  </Page>
);

/** @summary Moons list, variant A: flat sortable table, station under each moon, archived stations hidden behind a chip. */
export const ListA: Story = { render: () => listPage('A') };
/** @summary Moons list A in the phone shell: cards, Tax in the corner. */
export const ListAPhone: Story = { ...ListA, ...PHONE };

/** @summary Moons list, variant B: the same rows folded under their refinery, archived stations shown. */
export const ListB: Story = { render: () => listPage('B', true) };
/** @summary Moons list B in the phone shell. */
export const ListBPhone: Story = { ...ListB, ...PHONE };

/** @summary Moons list A with Show archived stations on: Archived pills, and a refinery with no Extraction yet ("Moon not known yet"). */
export const ListAArchived: Story = { render: () => listPage('A', true) };

const moonPage = (body: React.ReactNode) => (
  <Page>
    <MoonsChrome tab="moons" />
    {body}
  </Page>
);

/** @summary Opened moon, variant A: Extractions table, newest first, the Fully Mined pop expanded to make-up and miners. New component: PopDetail. */
export const MoonA: Story = {
  render: () => moonPage(<MoonPageA />),
};
/** @summary Opened moon A in the phone shell. */
export const MoonAPhone: Story = { ...MoonA, ...PHONE };

/** @summary Opened moon, variant B: one card per pop with its Started / Pop / Fractured / Field gone timeline. New component: PopCard. */
export const MoonB: Story = {
  render: () => moonPage(<MoonPageB />),
};
/** @summary Opened moon B in the phone shell. */
export const MoonBPhone: Story = { ...MoonB, ...PHONE };

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
