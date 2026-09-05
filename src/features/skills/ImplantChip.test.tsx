import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { ImplantChip } from './ImplantChip';

function CurrentLocation() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

describe('ImplantChip', () => {
  it('clicking navigates to Market filtered to the implant (#405)', () => {
    render(
      <MemoryRouter initialEntries={['/skills']}>
        <CurrentLocation />
        <ImplantChip typeId={9899} name="Ocular Filter - Basic" description="desc" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Ocular Filter - Basic/ }));

    expect(screen.getByTestId('location')).toHaveTextContent('/market?type=9899');
  });

  it('preserves an existing region param when clicked from inside /market', () => {
    render(
      <MemoryRouter initialEntries={['/market?region=10000002']}>
        <CurrentLocation />
        <ImplantChip typeId={9899} name="Ocular Filter - Basic" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Ocular Filter - Basic/ }));

    expect(screen.getByTestId('location')).toHaveTextContent('/market?type=9899&region=10000002');
  });
});
