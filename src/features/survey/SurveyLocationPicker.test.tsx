import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { ESI_REGISTRY } from '@/esi/registry';
import { SurveyLocationPicker } from './SurveyLocationPicker';

const scopes = vi.hoisted(() => ({ granted: [] as string[] }));
vi.mock('@/app/useGrantedScopes', () => ({ useGrantedScopes: () => scopes.granted }));
const { getCharacterSearch, listCachedStructures, loadStructureSummary } = vi.hoisted(() => ({
  getCharacterSearch: vi.fn(),
  listCachedStructures: vi.fn(),
  loadStructureSummary: vi.fn(),
}));
vi.mock('@/esi/endpoints', () => ({ getCharacterSearch }));
vi.mock('@/features/character/structures', () => ({ listCachedStructures, loadStructureSummary }));
const systemList = vi.hoisted(() => ({ failed: false, retry: vi.fn() }));
vi.mock('@/features/route/useSolarSystems', () => ({
  useSolarSystemList: () => ({ systems: [], ...systemList }),
}));
vi.mock('@/sde/loadMarketSde', () => ({
  loadNpcStations: async () => [{ id: 60001, name: 'Efa VI - Moon 9 - Bureau', systemId: 1 }],
}));

const MAVS = "Ainsan - Mav's Watering Hole";
const NAMES: Record<number, string> = { 1001: MAVS, 1002: 'Ainsan - Refinery' };

beforeEach(() => {
  listCachedStructures.mockResolvedValue([]);
  loadStructureSummary.mockImplementation(async (_c: number, id: number) => ({ name: NAMES[id] }));
});

afterEach(() => {
  cleanup();
  systemList.failed = false;
  systemList.retry.mockReset();
  scopes.granted = [];
  getCharacterSearch.mockReset();
  listCachedStructures.mockReset();
  loadStructureSummary.mockReset();
});

/** ESI's search answers each query only when the test says so. */
function heldSearch() {
  const waiting = new Map<string, (ids: number[]) => void>();
  getCharacterSearch.mockImplementation(
    (_c: number, _k: string[], term: string) =>
      new Promise((resolve) => {
        waiting.set(term, (ids) => resolve({ data: { structure: ids } }));
      })
  );
  return {
    answer: async (term: string, ids: number[]) => {
      await waitFor(() => expect(waiting.has(term)).toBe(true));
      waiting.get(term)!(ids);
    },
  };
}

describe('SurveyLocationPicker', () => {
  it('offers what was typed as a manual location when no result carries that name', async () => {
    const onPick = vi.fn();
    render(<SurveyLocationPicker value={null} characterId={7} onPick={onPick} />);
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'Moro - Not a moodrill' } });
    fireEvent.click(await screen.findByRole('option', { name: /as a manual location/ }));
    expect(onPick).toHaveBeenCalledWith({
      id: null,
      name: 'Moro - Not a moodrill',
      kind: 'manual',
    });
  });

  it('lists a matching NPC station beside the manual row', async () => {
    render(<SurveyLocationPicker value={null} characterId={7} onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'efa' } });
    expect(await screen.findByRole('option', { name: /Efa VI - Moon 9/ })).toBeTruthy();
  });

  it('says the system list could not load, with Retry, when it failed', () => {
    systemList.failed = true;
    render(<SurveyLocationPicker value={null} characterId={7} onPick={vi.fn()} />);
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getAllByText("System list couldn't load").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(systemList.retry).toHaveBeenCalledOnce();
  });

  it('picks a structure this device already knows the moment its full name is pasted', async () => {
    listCachedStructures.mockResolvedValue([{ id: 1001, name: MAVS }]);
    const onPick = vi.fn();
    render(<SurveyLocationPicker value={null} characterId={7} onPick={onPick} />);
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.paste(box);
    fireEvent.change(box, { target: { value: MAVS } });
    await waitFor(() =>
      expect(onPick).toHaveBeenCalledWith({ id: 1001, name: MAVS, kind: 'structure' })
    );
  });

  it('highlights a typed exact name, ignoring punctuation, without picking it', async () => {
    listCachedStructures.mockResolvedValue([{ id: 1001, name: MAVS }]);
    const onPick = vi.fn();
    render(<SurveyLocationPicker value={null} characterId={7} onPick={onPick} />);
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'ainsan mavs watering hole' } });
    const option = await screen.findByRole('option', { name: /Mav's Watering Hole/ });
    expect(option.getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('option', { name: /as a manual location/ })).toBeNull();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith({ id: 1001, name: MAVS, kind: 'structure' });
  });

  it('holds Enter while structures are searched, then takes the match ESI finds', async () => {
    scopes.granted = [ESI_REGISTRY.getCharacterSearch.scope];
    const search = heldSearch();
    const onPick = vi.fn();
    render(<SurveyLocationPicker value={null} characterId={7} onPick={onPick} />);
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: MAVS } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getAllByText('Searching structures…').length).toBeGreaterThan(0);
    expect(onPick).not.toHaveBeenCalled();
    await search.answer(MAVS, []);
    await search.answer('Ainsan Mav Watering Hole', [1001]);
    await waitFor(() =>
      expect(onPick).toHaveBeenCalledWith({ id: 1001, name: MAVS, kind: 'structure' })
    );
  });

  it('keeps a held Enter as a manual location when the search finds nothing', async () => {
    scopes.granted = [ESI_REGISTRY.getCharacterSearch.scope];
    getCharacterSearch.mockResolvedValue({ data: {} });
    const onPick = vi.fn();
    render(<SurveyLocationPicker value={null} characterId={7} onPick={onPick} />);
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'Moro - Gone' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onPick).toHaveBeenCalledWith({ id: null, name: 'Moro - Gone', kind: 'manual' })
    );
  });

  it('keeps the earlier structures that still match while a longer name is searched', async () => {
    scopes.granted = [ESI_REGISTRY.getCharacterSearch.scope];
    const search = heldSearch();
    render(<SurveyLocationPicker value={null} characterId={7} onPick={vi.fn()} />);
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'Ainsan' } });
    await search.answer('Ainsan', [1001, 1002]);
    expect(await screen.findByRole('option', { name: /Refinery/ })).toBeTruthy();
    fireEvent.change(box, { target: { value: 'Ainsan - Mav' } });
    expect(screen.getByRole('option', { name: /Mav's Watering Hole/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Refinery/ })).toBeNull();
  });
});
