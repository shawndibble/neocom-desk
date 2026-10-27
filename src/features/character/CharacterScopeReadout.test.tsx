import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CharacterScopeReadout } from './CharacterScopeReadout';

describe('CharacterScopeReadout', () => {
  it('names every Character when all are covered', () => {
    render(<CharacterScopeReadout scope="all" total={4} />);
    expect(screen.getByText('All characters · 4')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /missing/i })).toBeNull();
  });

  it('names the one Character it covers', () => {
    render(<CharacterScopeReadout scope="one" characterId={1} characterName="Aria Vale" />);
    expect(screen.getByText('Aria Vale only')).toBeInTheDocument();
  });

  it('shows N of M with a warning and names who is missing', async () => {
    render(<CharacterScopeReadout scope="all" total={4} missing={['Bex Roan']} />);
    const readout = screen.getByText('All characters · 3 of 4');
    expect(readout).toBeInTheDocument();
    await userEvent.setup().hover(readout);
    expect(await screen.findAllByText(/Not included: Bex Roan/)).not.toHaveLength(0);
  });

  it('reads the corp division', () => {
    render(<CharacterScopeReadout scope="corp" division="Division 1" />);
    expect(screen.getByText('Corp · Division 1')).toBeInTheDocument();
  });
});
