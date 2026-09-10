import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CraftSweepControl } from './CraftSweepControl';

const strategySelect = () => screen.getByRole('combobox', { name: 'Sweep Strategy' });
const depthSelect = () => screen.getByRole('combobox', { name: 'Sweep Depth' });
const applyButton = () => screen.getByRole('button', { name: 'Apply Craft Sweep' });

async function openOptions(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) {
  await user.click(trigger);
  return screen.findAllByRole('option');
}

describe('CraftSweepControl', () => {
  it('opens on Cost-effective / All levels', () => {
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(strategySelect()).toHaveTextContent('Cost-effective');
    expect(depthSelect()).toHaveTextContent('All levels');
  });

  it('offers exactly the three Sweep Strategies', async () => {
    const user = userEvent.setup();
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    const options = await openOptions(user, strategySelect());
    expect(options.map((o) => o.textContent?.replace(/^\W+/, ''))).toEqual([
      'Cost-effective',
      'Build',
      'Buy',
    ]);
  });

  it("sizes Sweep Depth's options to the plan's own tree depth, plus All levels", async () => {
    const user = userEvent.setup();
    render(<CraftSweepControl maxDepth={3} scope={['manufacturing']} onApply={vi.fn()} />);

    const options = await openOptions(user, depthSelect());
    expect(options.map((o) => o.textContent?.replace(/^\W+/, ''))).toEqual([
      '1 level',
      '2 levels',
      '3 levels',
      'All levels',
    ]);
  });

  it('shows a reserved Reactions chip when Reactions is not eligible — no Manufacturing chip; Planetary always stays reserved', () => {
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(screen.queryByText('Manufacturing')).not.toBeInTheDocument();
    expect(screen.getByText('Reactions')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Planetary')).toHaveAttribute('aria-disabled', 'true');
  });

  it('lights up Reactions once it is in scope (issue #698) — no Manufacturing chip; Planetary stays reserved regardless', () => {
    render(
      <CraftSweepControl maxDepth={2} scope={['manufacturing', 'reaction']} onApply={vi.fn()} />
    );

    expect(screen.queryByText('Manufacturing')).not.toBeInTheDocument();
    expect(screen.getByText('Reactions')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('Planetary')).toHaveAttribute('aria-disabled', 'true');
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

  it('applies the chosen strategy and depth once the confirmation is accepted', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<CraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(strategySelect());
    await user.click(screen.getByRole('option', { name: 'Build' }));
    await user.click(depthSelect());
    await user.click(screen.getByRole('option', { name: '1 level' }));

    await user.click(applyButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Apply Craft Sweep' }));

    expect(onApply).toHaveBeenCalledWith({ strategy: 'build', depth: 1, depthChoice: 1 });
  });

  it('resolves "All levels" to the plan\'s own max depth', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<CraftSweepControl maxDepth={4} scope={['manufacturing']} onApply={onApply} />);

    await user.click(applyButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Apply Craft Sweep' }));

    expect(onApply).toHaveBeenCalledWith({
      strategy: 'cost-effective',
      depth: 4,
      depthChoice: 'all',
    });
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
