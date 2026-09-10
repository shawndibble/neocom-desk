import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BuildPlanCraftSweepControl } from './BuildPlanCraftSweepControl';

const strategySelect = () => screen.getByRole('combobox', { name: 'Sweep Strategy' });
const applyButton = () => screen.getByRole('button', { name: 'Apply Craft Sweep' });

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

  it('shows Manufacturing as the only enabled Craft Scope chip when Reactions is not eligible; Planetary always stays reserved', () => {
    render(<BuildPlanCraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(screen.getByText('Manufacturing')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('Reactions')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Planetary')).toHaveAttribute('aria-disabled', 'true');
  });

  it('lights up Reactions once it is in scope (issue #698) — Planetary stays reserved regardless', () => {
    render(
      <BuildPlanCraftSweepControl
        maxDepth={2}
        scope={['manufacturing', 'reaction']}
        onApply={vi.fn()}
      />
    );

    expect(screen.getByText('Manufacturing')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('Reactions')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('Planetary')).toHaveAttribute('aria-disabled', 'true');
  });

  it('applies the chosen strategy immediately on press — no confirmation dialog', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<BuildPlanCraftSweepControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(strategySelect());
    await user.click(screen.getByRole('option', { name: 'Build' }));
    await user.click(applyButton());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith({ strategy: 'build' });
  });

  it('disables Apply when the plan has nothing to sweep', () => {
    render(<BuildPlanCraftSweepControl maxDepth={0} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(applyButton()).toBeDisabled();
  });

  it('disables Apply while prices are not yet loaded', () => {
    render(
      <BuildPlanCraftSweepControl
        maxDepth={2}
        scope={['manufacturing']}
        disabled
        onApply={vi.fn()}
      />
    );

    expect(applyButton()).toBeDisabled();
  });
});
