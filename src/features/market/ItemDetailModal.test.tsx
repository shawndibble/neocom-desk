import { useState } from 'react';
import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { ESI_BASE_URL } from '@/esi/client';
import { ItemDetailModal } from './ItemDetailModal';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';

vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(),
}));

const mockedLoadDictionary = vi.mocked(loadAttributeDictionary);

const TYPE_ID = 587;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

describe('ItemDetailModal', () => {
  it('shows a loading state while ESI and the attribute dictionary are in flight', () => {
    server.use(http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () => new Promise(() => {})));
    mockedLoadDictionary.mockReturnValue(new Promise(() => {}));
    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an error state inside the modal, not an empty shell, when ESI fails', async () => {
    server.use(http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () => HttpResponse.error()));
    mockedLoadDictionary.mockResolvedValue({});
    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);
    expect(await screen.findByText("Couldn't load item info")).toBeInTheDocument();
  });

  it('shows the item name, volume, description and grouped attributes on success', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Rifter',
          description: 'A rugged little frigate.',
          group_id: 25,
          published: true,
          volume: 27289,
          dogma_attributes: [
            { attribute_id: 9, value: 1200 },
            { attribute_id: 37, value: 250 },
            { attribute_id: 99999, value: 42 }, // no dictionary entry — must be skipped
          ],
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
      37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel' },
    });

    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);

    expect(await screen.findByText('A rugged little frigate.')).toBeInTheDocument();
    expect(screen.getByText('Volume: 27,289 m3')).toBeInTheDocument();
    expect(screen.getByText('Structure')).toBeInTheDocument();
    expect(screen.getByText('Structure Hitpoints')).toBeInTheDocument();
    expect(screen.getByText('1,200 HP')).toBeInTheDocument();
    expect(screen.getByText('Speed and Travel')).toBeInTheDocument();
    expect(screen.getByText('Maximum Velocity')).toBeInTheDocument();
    expect(screen.getByText('250 m/sec')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Rifter',
          description: '',
          group_id: 25,
          published: true,
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({});

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => setOpen(false)} />
          )}
        </>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Rifter' })).toBeInTheDocument());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
