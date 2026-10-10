import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
