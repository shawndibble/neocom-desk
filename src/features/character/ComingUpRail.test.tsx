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
