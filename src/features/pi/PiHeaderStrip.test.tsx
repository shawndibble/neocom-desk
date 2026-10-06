import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { PiHeaderStrip } from './PiHeaderStrip';
import { DEFAULT_PI_SETTINGS, usePiSettings } from './piSettings';

beforeEach(() => {
  usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: true });
});

describe('PiHeaderStrip', () => {
  it('labels the route measure the home route, so it is not read as the Hauling figure', () => {
    usePiSettings.setState({ value: { ...DEFAULT_PI_SETTINGS, buybackPct: 85 }, hydrated: true });
    render(
      <MemoryRouter>
        <PiHeaderStrip colonySystemIds={[30000142]} estimate={false} />
      </MemoryRouter>
    );
    const strip = screen.getByTestId('pi-header-strip');
    expect(within(strip).getByText('Home route')).toBeInTheDocument();
    expect(within(strip).queryByText('Route')).not.toBeInTheDocument();
  });
});
