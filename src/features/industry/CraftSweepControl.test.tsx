import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CraftSweepControl } from './CraftSweepControl';

const strategySelect = () => screen.getByRole('combobox', { name: 'Sweep Strategy' });
const applyButton = () => screen.getByRole('button', { name: 'Apply Craft Sweep' });

describe('CraftSweepControl', () => {
  it('opens on Cost-effective', () => {
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(strategySelect()).toHaveTextContent('Cost-effective');
  });

  it('has no Sweep Depth control (issue #798)', () => {
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(screen.queryByRole('combobox', { name: 'Sweep Depth' })).not.toBeInTheDocument();
  });

  it('offers exactly the three Sweep Strategies', async () => {
    const user = userEvent.setup();
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    await user.click(strategySelect());
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent?.replace(/^\W+/, ''))).toEqual([
      'Cost-effective',
      'Build',
      'Buy',
    ]);
  });

  it('shows a reserved Reactions chip when Reactions is not eligible — no Manufacturing or Planetary chip', () => {
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(screen.queryByText('Manufacturing')).not.toBeInTheDocument();
    expect(screen.getByText('Reactions')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText('Planetary')).not.toBeInTheDocument();
  });

  it('lights up Reactions once it is in scope (issue #698) — no Manufacturing or Planetary chip', () => {
    render(
      <CraftSweepControl maxDepth={2} scope={['manufacturing', 'reaction']} onApply={vi.fn()} />
    );

    expect(screen.queryByText('Manufacturing')).not.toBeInTheDocument();
    expect(screen.getByText('Reactions')).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText('Planetary')).not.toBeInTheDocument();
  });

  it('asks for a generic overwrite confirmation before applying — never a computed preview', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(applyButton());

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('This will overwrite craft/buy choices on this plan — continue?')
    ).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies the chosen strategy once the confirmation is accepted', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(strategySelect());
    await user.click(screen.getByRole('option', { name: 'Build' }));

    await user.click(applyButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Apply Craft Sweep' }));

    expect(onApply).toHaveBeenCalledWith({ strategy: 'build' });
  });

  it('defaults to Cost-effective when applied without touching the select', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<CraftSweepControl maxDepth={4} scope={['manufacturing']} onApply={onApply} />);

    await user.click(applyButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Apply Craft Sweep' }));

    expect(onApply).toHaveBeenCalledWith({ strategy: 'cost-effective' });
  });

  it('cancelling the confirmation applies nothing', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(applyButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('disables Apply when the plan has nothing to sweep', () => {
    render(<CraftSweepControl maxDepth={0} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(applyButton()).toBeDisabled();
  });

  it('disables Apply while prices are not yet loaded', () => {
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} disabled onApply={vi.fn()} />);

    expect(applyButton()).toBeDisabled();
  });
});
