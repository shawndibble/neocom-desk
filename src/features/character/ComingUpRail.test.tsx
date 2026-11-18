import { DAY_MS } from '@/lib/age';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ComingUpRail } from './ComingUpRail';

const noop = () => {};
const base = {
  nowMs: Date.UTC(2026, 9, 9, 12),
  onClearDay: noop,
  onSelectEvent: noop,
  noKindsSelected: false,
};

describe('ComingUpRail status', () => {
  it('announces the scope and the empty state of a picked day', async () => {
    const { rerender } = render(<ComingUpRail {...base} items={[]} selectedDayMs={null} />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nothing coming up'));
    rerender(<ComingUpRail {...base} items={[]} selectedDayMs={base.nowMs} />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Nothing due on this day')
    );
  });
});

describe('ComingUpRail skyhook raids', () => {
  it('opens a skyhook raid row by its skyhook id, named by kind', async () => {
    const onSelectSkyhook = vi.fn();
    render(
      <ComingUpRail
        {...base}
        selectedDayMs={null}
        onSelectSkyhook={onSelectSkyhook}
        items={[
          {
            id: 'skyhookRaid:5',
            sourceId: '5',
            kind: 'skyhookRaid',
            subject: 'X-7OMU IV',
            detail: 'upcoming',
            deadlineMs: base.nowMs + 2 * 3_600_000,
            remainingMs: 2 * 3_600_000,
            response: null,
            important: false,
          },
        ]}
      />
    );
    const row = await screen.findByRole('button', { name: /X-7OMU IV/ });
    expect(row).toHaveTextContent('Skyhook raids');
    expect(row).toHaveTextContent('raid window opens');
    await userEvent.click(row);
    expect(onSelectSkyhook).toHaveBeenCalledWith(5);
  });
});

describe('ComingUpRail long-overdue items', () => {
  const extractor = (id: string, ageDays: number) => ({
    id: `planetExtraction:${id}`,
    sourceId: id,
    kind: 'planetExtraction' as const,
    subject: id,
    detail: '',
    deadlineMs: base.nowMs - ageDays * DAY_MS,
    remainingMs: -ageDays * DAY_MS,
    response: null,
    important: false,
  });
  const items = [extractor('Old A', 31), extractor('Old B', 9), extractor('Fresh', 1)];

  it('folds items overdue for over two days into one summary row that expands', async () => {
    render(<ComingUpRail {...base} selectedDayMs={null} items={items} />);
    const summary = await screen.findByRole('button', { name: /oldest 31 days/i });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(summary).toHaveTextContent('2');
    expect(screen.queryByText('Old A')).toBeNull();
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    await userEvent.click(summary);
    expect(screen.getByText('Old A')).toBeInTheDocument();
    expect(screen.getByText('Old B')).toBeInTheDocument();
  });

  it('folds nothing on a picked day', async () => {
    render(<ComingUpRail {...base} selectedDayMs={base.nowMs - 31 * DAY_MS} items={items} />);
    expect(await screen.findByText('Old A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /oldest/i })).toBeNull();
  });
});
