import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { userEvent } from 'storybook/test';
import { BookProvider } from '@/features/corp/moons/BookContext';
import { BOOK_CONTEXT, BOOK_VIEW } from '@/features/corp/moons/corpBookFixture';
import { ExtractionTimeline } from '@/features/corp/moons/ExtractionTimeline';
import { DEFAULT_STATES } from '@/features/corp/moons/extractionStates';
import { ProposedTimeline, STATE_ROWS } from './extractionAutofractureParts';

const meta = {
  title: 'mockups/ExtractionAutofracture',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/corp/moons/extractions', scopes: [] } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { globals: { viewport: { value: 'mobile1', isRotated: false } } } as const;

function Page({ children }: { children: ReactNode }) {
  return (
    <BookProvider value={{ ...BOOK_CONTEXT, openSettings: () => {} }}>
      <div className="mx-auto max-w-page space-y-4 px-4 py-4">{children}</div>
    </BookProvider>
  );
}

function Stack({ rows, openRow }: { rows: typeof STATE_ROWS; openRow: string }) {
  return (
    <Page>
      <ExtractionTimeline rows={rows} states={DEFAULT_STATES} />
      <ProposedTimeline rows={rows} title="Proposed" openRow={openRow} />
    </Page>
  );
}

const showTip: Story['play'] = async ({ canvasElement }) => {
  await userEvent.tab();
  canvasElement.ownerDocument.querySelector<HTMLElement>('[data-open-tip="true"]')?.focus();
};

export const Mixed: Story = {
  render: () => (
    <Stack
      rows={BOOK_VIEW.extractions}
      openRow={BOOK_VIEW.extractions.find((r) => r.fracturedBy === 'laser')?.id ?? ''}
    />
  ),
  play: showTip,
};

export const MixedPhone: Story = { ...Mixed, ...phone };

export const States: Story = {
  render: () => <Stack rows={STATE_ROWS} openRow="pulled" />,
  play: showTip,
};

export const StatesPhone: Story = { ...States, ...phone };
