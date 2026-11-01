import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { NewCorpBanner, ResumeNotice } from './AddCorpsNotices';

describe('NewCorpBanner', () => {
  it('names the corp and its CEO and offers three ways out', async () => {
    const onConnect = vi.fn();
    const onNotNow = vi.fn();
    const onDontAsk = vi.fn();
    render(
      <NewCorpBanner
        name="Ironvale Reach Two"
        ceoName="Kestrel Vane"
        onConnect={onConnect}
        onNotNow={onNotNow}
        onDontAsk={onDontAsk}
      />
    );
    expect(screen.getByText('New corp found: Ironvale Reach Two.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await userEvent.click(screen.getByRole('button', { name: "Don't ask again" }));
    expect([onConnect, onNotNow, onDontAsk].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
});

describe('ResumeNotice', () => {
  it('shows the place in the run and continues it', async () => {
    const onContinue = vi.fn();
    render(<ResumeNotice done={5} total={12} onContinue={onContinue} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue (5 of 12)' }));
    expect(onContinue).toHaveBeenCalled();
  });
});
