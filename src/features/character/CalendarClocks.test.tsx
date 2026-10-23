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

  it('shows EVE time as UTC HH:MM', async () => {
    render(<CalendarClocks />);
    const label = await screen.findByText('EVE');
    expect(label.nextElementSibling).toHaveTextContent('Fri 14:32');
  });

  it('also labels the local clock', async () => {
    render(<CalendarClocks />);
    expect(await screen.findByText('Local')).toBeInTheDocument();
  });
});
