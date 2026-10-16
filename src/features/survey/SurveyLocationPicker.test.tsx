import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { SurveyLocationPicker } from './SurveyLocationPicker';

vi.mock('@/app/useGrantedScopes', () => ({ useGrantedScopes: () => [] }));
const systemList = vi.hoisted(() => ({ failed: false, retry: vi.fn() }));
vi.mock('@/features/route/useSolarSystems', () => ({
  useSolarSystemList: () => ({ systems: [], ...systemList }),
}));
vi.mock('@/sde/loadMarketSde', () => ({
  loadNpcStations: async () => [{ id: 60001, name: 'Efa VI - Moon 9 - Bureau', systemId: 1 }],
}));

afterEach(() => {
  cleanup();
  systemList.failed = false;
  systemList.retry.mockReset();
});

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
});
