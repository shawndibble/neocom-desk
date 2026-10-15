import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { HowItWorks } from './HowItWorks';

describe('HowItWorks', () => {
  it('lists three numbered steps, each with a screenshot', () => {
    render(<HowItWorks onCustomize={() => {}} />);
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    ['01', '02', '03'].forEach((number, index) => {
      expect(within(steps[index]).getByText(number)).toBeInTheDocument();
      expect(within(steps[index]).getByRole('img')).toHaveAttribute('alt');
    });
    expect(screen.getByRole('heading', { name: 'Log in with EVE' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Choose what to share' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'See your answers' })).toBeInTheDocument();
  });

  it('opens the permissions dialog from the sharing step', async () => {
    const onCustomize = vi.fn();
    render(<HowItWorks onCustomize={onCustomize} />);
    await userEvent.click(screen.getByRole('button', { name: /log in with custom permissions/i }));
    expect(onCustomize).toHaveBeenCalledTimes(1);
  });
});
