import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { PiHeaderStrip } from './PiHeaderStrip';
import { DEFAULT_PI_SETTINGS, usePiSettings } from './piSettings';

const routes = vi.hoisted(() => ({ jumps: {} as Record<number, number> }));
vi.mock('@/features/route/jumpBasis', () => ({
  useJumpBasis: () => ({ rules: {}, network: {}, key: 'k', hydrated: true }),
}));
vi.mock('@/features/contractSearch/routeExposure', () => ({
  routeExposure: vi.fn(async (_from: number, to: number) => {
    const n = routes.jumps[to];
    if (n === undefined) return { kind: 'unknown' };
    return {
      kind: 'known',
      path: Array.from({ length: n + 1 }, () => ({ security: 0.9 })),
    };
  }),
}));

beforeEach(() => {
  routes.jumps = {};
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

  describe('nearest hub suggestion', () => {
    const HEK = 30002053;
    const JITA = 30000142;
    const strip = () => (
      <MemoryRouter>
        <PiHeaderStrip colonySystemIds={[31000005]} estimate={false} />
      </MemoryRouter>
    );

    it('suggests a nearer hub, with why, and accepting picks it', async () => {
      routes.jumps = { [JITA]: 28, [HEK]: 9 };
      render(strip());
      const hint = await screen.findByTestId('pi-nearest-hub');
      expect(hint).toHaveTextContent('Nearest hub: Hek, 9 jumps');
      await userEvent.click(within(hint).getByRole('button', { name: 'Sell at Hek' }));
      expect(usePiSettings.getState().value).toMatchObject({ hub: 'hek', hubChosen: true });
      await waitFor(() => expect(screen.queryByTestId('pi-nearest-hub')).not.toBeInTheDocument());
    });

    it('keeping the current hub dismisses it for good', async () => {
      routes.jumps = { [JITA]: 28, [HEK]: 9 };
      render(strip());
      await userEvent.click(await screen.findByRole('button', { name: 'Keep Jita' }));
      expect(usePiSettings.getState().value).toMatchObject({ hub: 'jita', hubChosen: true });
    });

    it('stays quiet when the current hub is nearest, the choice is made, or no route is known', async () => {
      routes.jumps = { [JITA]: 3, [HEK]: 9 };
      const { unmount } = render(strip());
      await screen.findByTestId('pi-header-strip');
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByTestId('pi-nearest-hub')).not.toBeInTheDocument();
      unmount();

      routes.jumps = { [HEK]: 1 };
      usePiSettings.setState({
        value: { ...DEFAULT_PI_SETTINGS, hubChosen: true },
        hydrated: true,
      });
      const second = render(strip());
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByTestId('pi-nearest-hub')).not.toBeInTheDocument();
      second.unmount();

      routes.jumps = {};
      usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: true });
      render(strip());
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByTestId('pi-nearest-hub')).not.toBeInTheDocument();
    });
  });
});
