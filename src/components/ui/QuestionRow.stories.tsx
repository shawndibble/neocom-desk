import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QuestionRow } from './QuestionRow';

/**
 * @summary A body-size FAQ row that opens its answer below. The caller owns `expanded` and the
 * row's frame.
 */
const meta = {
  title: 'ui/QuestionRow',
  component: QuestionRow,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof QuestionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROWS = [
  { id: 'a', q: 'Why is my data a few minutes old?', a: 'ESI caches each endpoint.' },
  { id: 'b', q: 'Can I use it on my phone?', a: 'Yes, though it is built for a desktop first.' },
];

function Demo({ framed }: { framed: boolean }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(['b']));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <ul className={framed ? 'space-y-2' : 'divide-y divide-line border border-line bg-bg/60'}>
      {ROWS.map((row) => (
        <QuestionRow
          key={row.id}
          question={row.q}
          expanded={open.has(row.id)}
          onToggle={() => toggle(row.id)}
          className={framed ? 'rounded-xs border border-line bg-panel/85' : undefined}
          answerClassName={framed ? undefined : 'text-text-dim'}
        >
          <p>{row.a}</p>
        </QuestionRow>
      ))}
    </ul>
  );
}

const ARGS = { question: '', expanded: false, onToggle: () => {}, children: null };

/** @summary Each question in its own card (Help › FAQ). */
export const Cards: Story = { args: ARGS, render: () => <Demo framed /> };

/** @summary Hairline-divided in one box, answers dimmed (the landing page). */
export const Divided: Story = { args: ARGS, render: () => <Demo framed={false} /> };
