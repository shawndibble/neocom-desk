import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BuildPlanCraftSweepControl } from './BuildPlanCraftSweepControl';

const strategySelect = () => screen.getByRole('combobox', { name: 'Sweep Strategy' });
const reapplyButton = () => screen.getByRole('button', { name: 'Apply Craft Sweep' });

describe('BuildPlanCraftSweepControl', () => {
  it('opens on Cost-effective', () => {
    render(<BuildPlanCraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(strategySelect()).toHaveTextContent('Cost-effective');
  });

  it('has no Sweep Depth control and no "Craft Sweep" header/tooltip', () => {
    render(<BuildPlanCraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(screen.queryByRole('combobox', { name: 'Sweep Depth' })).not.toBeInTheDocument();
    expect(screen.queryByText('Craft Sweep')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('About Craft Sweep')).not.toBeInTheDocument();
  });

  it('offers exactly the three Sweep Strategies', async () => {
    const user = userEvent.setup();
    render(<BuildPlanCraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    await user.click(strategySelect());
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent?.replace(/^\W+/, ''))).toEqual([
      'Cost-effective',
      'Build',
      'Buy',
    ]);
  });

  it('shows only a reserved Reactions chip when Reactions is not eligible — no Manufacturing chip, no Planetary chip', () => {
    render(<BuildPlanCraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(screen.queryByText('Manufacturing')).not.toBeInTheDocument();
    expect(screen.getByText('Reactions')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Reactions')).toHaveAttribute(
      'title',
      'Turn on Include Reactions to use this'
    );
    expect(screen.queryByText('Planetary')).not.toBeInTheDocument();
  });

  it('lights up Reactions once it is in scope (issue #698), with its own tooltip — no Manufacturing or Planetary chip', () => {
    render(
      <BuildPlanCraftSweepControl
        maxDepth={2}
        scope={['manufacturing', 'reaction']}
        onApply={vi.fn()}
      />
    );

    expect(screen.queryByText('Manufacturing')).not.toBeInTheDocument();
    expect(screen.getByText('Reactions')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('Reactions')).toHaveAttribute(
      'title',
      'Reaction materials are included when the sweep runs'
    );
    expect(screen.queryByText('Planetary')).not.toBeInTheDocument();
  });

  it('applies immediately when the Sweep Strategy changes — no confirmation dialog', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<BuildPlanCraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(strategySelect());
    await user.click(screen.getByRole('option', { name: 'Build' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith({ strategy: 'build' });
  });

  it('reselecting the already-shown strategy applies nothing — a controlled select never fires a change event for its own current value', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<BuildPlanCraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(strategySelect());
    await user.click(screen.getByRole('option', { name: 'Cost-effective' }));

    expect(onApply).not.toHaveBeenCalled();
  });

  it('the re-run button applies the current (default) strategy without touching the select — covers the gap above', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<BuildPlanCraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(reapplyButton());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith({ strategy: 'cost-effective' });
  });

  it('the re-run button re-applies the currently selected strategy after it has been changed', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<BuildPlanCraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(strategySelect());
    await user.click(screen.getByRole('option', { name: 'Buy' }));
    onApply.mockClear();

    await user.click(reapplyButton());

    expect(onApply).toHaveBeenCalledWith({ strategy: 'buy' });
  });

  it('disables the Sweep Strategy select and the re-run button when the plan has nothing to sweep', () => {
    render(<BuildPlanCraftSweepControl maxDepth={0} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(strategySelect()).toBeDisabled();
    expect(reapplyButton()).toBeDisabled();
  });

  it('disables the Sweep Strategy select and the re-run button while prices are not yet loaded', () => {
    render(
      <BuildPlanCraftSweepControl
        maxDepth={2}
        scope={['manufacturing']}
        disabled
        onApply={vi.fn()}
      />
    );

    expect(strategySelect()).toBeDisabled();
    expect(reapplyButton()).toBeDisabled();
  });
});
