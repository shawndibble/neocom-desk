import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BuildPlanAutoBuildControl } from './BuildPlanAutoBuildControl';

const strategySelect = () => screen.getByRole('combobox', { name: 'Build Strategy' });

describe('BuildPlanAutoBuildControl', () => {
  it('opens on Cost-effective', () => {
    render(<BuildPlanAutoBuildControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(strategySelect()).toHaveTextContent('Cost-effective');
  });

  it('has no depth control, no re-run button, and no "Auto Build" header/tooltip (issue #798)', () => {
    render(<BuildPlanAutoBuildControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(screen.queryByRole('combobox', { name: 'Depth' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Auto Build' })).not.toBeInTheDocument();
    expect(screen.queryByText('Auto Build')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('About Auto Build')).not.toBeInTheDocument();
  });

  it('offers exactly the three Build Strategies', async () => {
    const user = userEvent.setup();
    render(<BuildPlanAutoBuildControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    await user.click(strategySelect());
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent?.replace(/^\W+/, ''))).toEqual([
      'Cost-effective',
      'Build',
      'Buy',
    ]);
  });

  it('shows only a reserved Reactions chip when Reactions is not eligible — no Manufacturing chip, no Planetary chip', async () => {
    render(<BuildPlanAutoBuildControl maxDepth={2} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(screen.queryByText('Manufacturing')).not.toBeInTheDocument();
    const reactionsChip = screen.getByText('Reactions');
    expect(reactionsChip).toHaveAttribute('aria-disabled', 'true');
    fireEvent.pointerMove(reactionsChip);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Edit setup and turn on Include Reactions to use this'
    );
    expect(screen.queryByText('Planetary')).not.toBeInTheDocument();
  });

  it('lights up Reactions once it is in scope (issue #698), with its own tooltip — no Manufacturing or Planetary chip', async () => {
    render(
      <BuildPlanAutoBuildControl
        maxDepth={2}
        scope={['manufacturing', 'reaction']}
        onApply={vi.fn()}
      />
    );

    expect(screen.queryByText('Manufacturing')).not.toBeInTheDocument();
    const reactionsChip = screen.getByText('Reactions');
    expect(reactionsChip).not.toHaveAttribute('aria-disabled');
    fireEvent.pointerMove(reactionsChip);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Reaction materials are included when Auto Build runs'
    );
    expect(screen.queryByText('Planetary')).not.toBeInTheDocument();
  });

  it('applies immediately when the Build Strategy changes — no confirmation dialog', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<BuildPlanAutoBuildControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(strategySelect());
    await user.click(screen.getByRole('option', { name: 'Build' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith({ strategy: 'build' });
  });

  it('reselecting the already-shown strategy applies nothing — a controlled select never fires a change event for its own current value', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<BuildPlanAutoBuildControl maxDepth={2} scope={['manufacturing']} onApply={onApply} />);

    await user.click(strategySelect());
    await user.click(screen.getByRole('option', { name: 'Cost-effective' }));

    expect(onApply).not.toHaveBeenCalled();
  });

  it('disables the Build Strategy select when the plan has nothing to auto-build', () => {
    render(<BuildPlanAutoBuildControl maxDepth={0} scope={['manufacturing']} onApply={vi.fn()} />);

    expect(strategySelect()).toBeDisabled();
  });

  it('disables the Build Strategy select while prices are not yet loaded', () => {
    render(
      <BuildPlanAutoBuildControl
        maxDepth={2}
        scope={['manufacturing']}
        disabled
        onApply={vi.fn()}
      />
    );

    expect(strategySelect()).toBeDisabled();
  });
});
