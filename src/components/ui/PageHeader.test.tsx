import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title as the route heading', () => {
    render(<PageHeader title="Wallet" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Wallet' })).toBeInTheDocument();
  });

  it('renders meta beside the title and actions after it', () => {
    render(
      <PageHeader
        title="Assets"
        meta={<span>12m ago</span>}
        actions={<button type="button">Refresh</button>}
      />
    );
    expect(screen.getByText('12m ago')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('omits the actions cluster entirely when a route has no controls', () => {
    const { container } = render(<PageHeader title="Settings" />);
    expect(container.querySelector('header')?.children).toHaveLength(1);
  });

  describe('phone identity avatar', () => {
    beforeEach(async () => {
      await db.characters.clear();
      useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
    });

    async function seedPilot(): Promise<void> {
      await db.characters.put({ characterId: 42, name: 'Test Pilot', ownerHash: 'oh', addedAt: 0 });
      useActiveCharacter.setState({ activeCharacterId: 42, hydrated: true });
    }

    it('links to Characters, named for the active pilot', async () => {
      await seedPilot();
      render(
        <MemoryRouter initialEntries={['/mail']}>
          <PageHeader title="Mail" />
        </MemoryRouter>
      );
      const link = await screen.findByRole('link', { name: 'Test Pilot, switch character' });
      expect(link).toHaveAttribute('href', '/characters');
      expect(link).toHaveClass('md:hidden');
    });

    it('renders nothing without an active Character', () => {
      render(
        <MemoryRouter initialEntries={['/mail']}>
          <PageHeader title="Mail" />
        </MemoryRouter>
      );
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('is absent on the Characters route itself', async () => {
      await seedPilot();
      render(
        <MemoryRouter initialEntries={['/characters']}>
          <PageHeader title="Characters" />
        </MemoryRouter>
      );
      await screen.findByRole('heading', { name: 'Characters' });
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });
});
