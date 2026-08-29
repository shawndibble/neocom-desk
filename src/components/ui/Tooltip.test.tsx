import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tooltip, InfoTooltip } from './Tooltip';

describe('Tooltip', () => {
  it('renders a role="tooltip" bubble wired to its trigger via aria-describedby', () => {
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('One-line explanation.');
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
  });
});

describe('InfoTooltip', () => {
  it('renders a labeled "?" button describing the tooltip content', () => {
    render(<InfoTooltip label="About Material Efficiency" content="Reduces material use." />);
    const trigger = screen.getByRole('button', { name: 'About Material Efficiency' });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Reduces material use.');
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
  });
});
