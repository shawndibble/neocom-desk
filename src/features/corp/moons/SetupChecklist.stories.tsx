import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, BOOK_VIEW } from './corpBookFixture';
import { refineryUnreadable } from './moonsFormat';
import { OverviewTab } from './OverviewTab';
import { SetupChecklist } from './SetupChecklist';

type Context = typeof BOOK_CONTEXT;

function Checklist({ context, overview }: { context: Context; overview?: boolean }) {
  return (
    <BookProvider value={{ ...context, openSettings: () => {} }}>
      <div className="mx-auto max-w-page px-4 py-4">
        {overview ? <OverviewTab /> : <SetupChecklist />}
      </div>
    </BookProvider>
  );
}

const FRESH: Context = {
  ...BOOK_CONTEXT,
  names: {
    ...BOOK_CONTEXT.names,
    refinery: (id: number) =>
      id === BOOK_VIEW.input.extractions[0]?.structureId
        ? refineryUnreadable(id)
        : BOOK_CONTEXT.names.refinery(id),
  },
};

const meta = {
  title: 'corp/SetupChecklist',
  component: Checklist,
  parameters: { layout: 'fullscreen', shell: { path: '/corp/moons', scopes: [] } },
  args: { context: BOOK_CONTEXT },
} satisfies Meta<typeof Checklist>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PartlyDone: Story = {};

export const JustTurnedOn: Story = { args: { context: FRESH } };

export const OnOverview: Story = { args: { overview: true } };
