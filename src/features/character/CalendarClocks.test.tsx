import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { CalendarClocks } from './CalendarClocks';

describe('CalendarClocks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.UTC(2026, 9, 23, 14, 32, 10));
  });
  afterEach(() => vi.useRealTimers());

  it('shows EVE time as 24-hour UTC with an EVE suffix', async () => {
    render(<CalendarClocks />);
    expect(await screen.findByText('14:32 EVE')).toBeInTheDocument();
  });

  it('shows the local time with its zone, no label or weekday', async () => {
    render(<CalendarClocks />);
    await screen.findByText('14:32 EVE');
    expect(screen.queryByText('Local')).not.toBeInTheDocument();
    expect(screen.queryByText(/Fri/)).not.toBeInTheDocument();
  });
});
