import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PilotAffiliation } from './PilotAffiliation';

function renderAff(over: Partial<Parameters<typeof PilotAffiliation>[0]['row']>) {
  return render(
    <MemoryRouter>
      <PilotAffiliation
        row={{
          corporationId: 98,
          corporationName: 'Some Corp',
          allianceId: 99,
          allianceName: 'Some Alliance',
          ...over,
        }}
      />
    </MemoryRouter>
  );
}

describe('PilotAffiliation', () => {
  it('links the corporation and the alliance', () => {
    renderAff({});
    expect(screen.getByRole('link', { name: 'Some Corp' }).getAttribute('href')).toContain(
      'info=corp'
    );
    expect(screen.getByRole('link', { name: 'Some Alliance' }).getAttribute('href')).toContain(
      'info=alliance'
    );
  });

  it('shows a name without an id as plain text', () => {
    renderAff({ corporationId: null });
    expect(screen.getByText('Some Corp')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Some Corp' })).toBeNull();
  });

  it('renders nothing for a missing alliance, and nothing at all with neither', () => {
    const { container } = renderAff({ allianceName: null, allianceId: 99 });
    expect(screen.queryByRole('link', { name: /alliance/i })).toBeNull();
    expect(container.textContent).toBe('Some Corp');
    const empty = renderAff({ corporationName: null, allianceName: null });
    expect(empty.container.textContent).toBe('');
  });
});
