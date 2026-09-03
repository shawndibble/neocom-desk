import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { AttributeChips } from './AttributeChips';
import type { CharacterAttributes } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';

// Every value distinct, so a test can assert on one chip's text without
// ambiguity against the other four.
const ATTRIBUTES: CharacterAttributes = {
  intelligence: 20,
  memory: 22,
  perception: 29,
  willpower: 25,
  charisma: 24,
};

describe('AttributeChips', () => {
  it('shows the bare value when neither implants nor a booster apply', () => {
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={{}} />);
    expect(screen.getByText('20').closest('span')).toHaveClass('text-text');
  });

  it('shows base + implant = effective when only implants apply', () => {
    const implants: Implants = { perception: 4 };
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={implants} />);
    expect(screen.getByText('25 + 4 = 29')).toBeInTheDocument();
  });

  it('shows base + booster = effective when only a booster applies', () => {
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={{}} boosterBonus={4} />);
    // Every attribute carries the same uniform booster bonus.
    expect(screen.getByText('16 + 4 = 20')).toBeInTheDocument();
    expect(screen.getByText('25 + 4 = 29')).toBeInTheDocument();
  });

  it('shows base + implant + booster = effective when both apply, three terms not two', () => {
    const implants: Implants = { perception: 4 };
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={implants} boosterBonus={4} />);
    // Perception: 29 effective - 4 implant - 4 booster = 21 base.
    expect(screen.getByText('21 + 4 implant + 4 booster = 29')).toBeInTheDocument();
    // Intelligence: no implant, only the booster — still the two-term form.
    expect(screen.getByText('16 + 4 = 20')).toBeInTheDocument();
  });

  it('renders unknown when attributes could not be read, ignoring any booster figure', () => {
    render(<AttributeChips attributes={null} implantBonuses={{}} boosterBonus={4} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
