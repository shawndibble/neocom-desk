import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, BOOK_VIEW } from './corpBookFixture';
import { refineryUnreadable } from './moonsFormat';
import { OverviewTab } from './OverviewTab';
import { SetupChecklist } from './SetupChecklist';

type Context = typeof BOOK_CONTEXT;

function Checklist({ context, overview }: { context: Context; overview?: boolean }) {
  return (
    // The route's settings host, stood in for, so a Settings step shows its button.
    <BookProvider value={{ ...context, openSettings: () => {} }}>
      <div className="mx-auto max-w-page px-4 py-4">
        {overview ? <OverviewTab /> : <SetupChecklist />}
      </div>
    </BookProvider>
  );
}

/** A book just turned on: no Statement yet, and one refinery this Character cannot dock at. */
const FRESH: Context = {
  ...BOOK_CONTEXT,
  view: { ...BOOK_VIEW, input: { ...BOOK_VIEW.input, statements: [] } },
  names: {
    ...BOOK_CONTEXT.names,
    refinery: (id: number) =>
      id === BOOK_VIEW.input.extractions[0]?.structureId
        ? refineryUnreadable(id)
        : BOOK_CONTEXT.names.refinery(id),
  },
};

/**
 * "Set up the book" on the Overview: each step is read off the book, and a step
 * to do carries the one button that goes where it is done. Dismissed per viewer.
 */
const meta = {
  title: 'corp/SetupChecklist',
  component: Checklist,
  parameters: { layout: 'fullscreen', shell: { path: '/corp/moons', scopes: [] } },
  args: { context: BOOK_CONTEXT },
} satisfies Meta<typeof Checklist>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Partly done: rate, names and a first Statement done; Automatic sync to turn on. */
export const PartlyDone: Story = {};

/** @summary Just turned on: Automatic sync, an unreadable refinery and the first Statement to do. */
export const JustTurnedOn: Story = { args: { context: FRESH } };

/** @summary On the Overview, above the totals (the full sample book, so Needs you stays consistent). */
export const OnOverview: Story = { args: { overview: true } };
