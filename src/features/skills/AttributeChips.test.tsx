import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/** The hoverable total of one chip, found by the breakdown it announces. */
function total(breakdown: string) {
  return screen.getByLabelText(breakdown);
}

describe('AttributeChips', () => {
  it('shows the bare value when neither implants nor a booster apply', () => {
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={{}} />);
    expect(screen.getByText('20').closest('span')).toHaveClass('text-text');
  });

  it('shows the effective total, not the sum that produced it', () => {
    const implants: Implants = { perception: 4 };
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={implants} boosterBonus={4} />);
    expect(screen.getByText('29')).toBeInTheDocument();
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });

  it('reveals base + implant on hovering the total when only implants apply', async () => {
    const user = userEvent.setup();
    const implants: Implants = { perception: 4 };
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={implants} />);
    await user.hover(total('25 base + 4 implant = 29'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('25 base + 4 implant = 29');
  });

  it('reveals base + booster on hovering the total when only a booster applies', async () => {
    const user = userEvent.setup();
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={{}} boosterBonus={4} />);
    // Every attribute carries the same uniform booster bonus.
    expect(total('16 base + 4 booster = 20')).toBeInTheDocument();
    await user.hover(total('25 base + 4 booster = 29'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('25 base + 4 booster = 29');
  });

  it('reveals three terms, not two, when both an implant and a booster apply', async () => {
    const user = userEvent.setup();
    const implants: Implants = { perception: 4 };
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={implants} boosterBonus={4} />);
    // Perception: 29 effective - 4 implant - 4 booster = 21 base.
    await user.hover(total('21 base + 4 implant + 4 booster = 29'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '21 base + 4 implant + 4 booster = 29'
    );
    // Intelligence: no implant, so the booster is named on its own.
    expect(total('16 base + 4 booster = 20')).toBeInTheDocument();
  });

  it('reveals the breakdown on keyboard focus, so it is not hover-only', async () => {
    const user = userEvent.setup();
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={{ perception: 4 }} />);
    await user.tab();
    expect(total('25 base + 4 implant = 29')).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });

  it('leaves a bonus-free total unhoverable, with no bubble that only restates it', () => {
    render(<AttributeChips attributes={ATTRIBUTES} implantBonuses={{}} />);
    expect(screen.getByText('20')).not.toHaveAttribute('tabindex');
  });

  it('renders unknown when attributes could not be read, ignoring any booster figure', () => {
    render(<AttributeChips attributes={null} implantBonuses={{}} boosterBonus={4} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
