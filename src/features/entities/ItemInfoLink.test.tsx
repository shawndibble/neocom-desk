import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import '@/i18n';

vi.mock('@/features/market/ItemDetailModal', () => ({
  ItemDetailModal: ({
    typeId,
    itemName,
    onClose,
  }: {
    typeId: number;
    itemName: string;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={`Item ${typeId}`}>
      <h2>{itemName}</h2>
      <button type="button" onClick={onClose}>
        Close item
      </button>
    </div>
  ),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeName: vi.fn(async (id: number) => `Looked up ${id}`),
}));
import { useItemInfoModalStore } from '@/stores/itemInfoModal';
import { EntityInfoRoute } from './EntityInfoRoute';
import { ItemInfoLink } from './EntityLink';
import { ItemInfoModal } from './ItemInfoModal';

const probe: { navigate: ReturnType<typeof useNavigate>; search: string } = {
  navigate: () => Promise.resolve(),
  search: '',
};
function Probe() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    probe.navigate = navigate;
    probe.search = location.search;
  });
  return null;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <EntityInfoRoute />
      <ItemInfoModal />
      <Probe />
      <ItemInfoLink typeId={34}>Tritanium</ItemInfoLink>
    </MemoryRouter>
  );
}

beforeEach(() => useItemInfoModalStore.setState({ request: null, staged: null }));

describe('ItemInfoLink', () => {
  it('is a real anchor to the current page with info=type-<id>', () => {
    renderAt('/assets?tab=a');
    expect(screen.getByRole('link', { name: 'Tritanium' })).toHaveAttribute(
      'href',
      '/assets?tab=a&info=type-34'
    );
  });

  it('a click opens Item Detail titled with the link text; Back closes it', async () => {
    renderAt('/assets');
    fireEvent.click(screen.getByRole('link', { name: 'Tritanium' }));
    expect(await screen.findByRole('heading', { name: 'Tritanium' })).toBeInTheDocument();
    expect(probe.search).toBe('?info=type-34');

    act(() => void probe.navigate(-1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probe.search).toBe('');
  });

  it('a Ctrl+click does not stage a name', () => {
    renderAt('/assets');
    fireEvent.click(screen.getByRole('link', { name: 'Tritanium' }), { ctrlKey: true });
    expect(useItemInfoModalStore.getState().staged).toBeNull();
  });

  it('a pasted URL opens the modal and looks the name up', async () => {
    renderAt('/assets?info=type-35');
    expect(await screen.findByRole('heading', { name: 'Looked up 35' })).toBeInTheDocument();
  });

  it('Close goes back to the page without info', async () => {
    renderAt('/assets?x=1');
    fireEvent.click(screen.getByRole('link', { name: 'Tritanium' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close item' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probe.search).toBe('?x=1');
  });
});
