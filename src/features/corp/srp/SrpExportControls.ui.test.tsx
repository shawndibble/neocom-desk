import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import * as download from '@/lib/download';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { SrpExportButton, SrpExportPanel } from './SrpExportControls';

const CORP = 98000001;
const ME = 7;

const reads = vi.hoisted(() => ({
  settings: vi.fn(),
  claims: vi.fn(),
  activity: vi.fn(),
  doctrines: vi.fn(),
}));
vi.mock('@/esi/endpoints/corp', () => ({
  getCorporationPublicInfo: () => Promise.resolve({ data: { ticker: 'TEST' } }),
}));
vi.mock('../owner', () => ({ useActiveCorporationId: () => CORP }));
vi.mock('../srpClient', () => ({ readSrpSettings: reads.settings }));
vi.mock('../srpOfficerClient', () => ({
  readAllSrpClaims: reads.claims,
  readSrpActivity: reads.activity,
}));
vi.mock('../srpDoctrineClient', () => ({ readSrpDoctrines: reads.doctrines }));
vi.mock('@/sde/loadSde', () => ({ loadTypes: () => Promise.resolve({}) }));
vi.mock('@/sde/solarSystems', () => ({ loadSolarSystemsById: () => Promise.resolve(new Map()) }));

beforeEach(() => {
  vi.restoreAllMocks();
  useActiveCharacter.setState({ activeCharacterId: ME });
  reads.settings.mockReset().mockResolvedValue(null);
  reads.claims.mockReset().mockResolvedValue([]);
  reads.activity.mockReset().mockResolvedValue([]);
  reads.doctrines.mockReset().mockResolvedValue([]);
});

const button = () => screen.getByRole('button', { name: 'Download SRP data (.xlsx)' });

describe('SrpExportButton', () => {
  it('reads settings, every claim, the whole log and the Doctrine Fits, then downloads one workbook', async () => {
    const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    render(<SrpExportButton />);
    await userEvent.click(button());
    const done = await screen.findByRole('status');
    for (const read of [reads.settings, reads.claims, reads.doctrines])
      expect(read).toHaveBeenCalledWith(ME, CORP);
    expect(reads.activity).toHaveBeenCalledWith(ME, CORP, null);
    expect(save.mock.calls[0][0]).toMatch(/^neocom-corp-srp-test-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(done).toHaveTextContent(/· 4 sheets, 1 row$/);
  });
});

describe('SrpExportPanel', () => {
  it('sits in its own Export panel and lists the sheets', () => {
    render(<SrpExportPanel />);
    expect(screen.getByText('SRP data')).toBeInTheDocument();
    expect(screen.getByText(/SRP Claims \(every state\)/)).toBeInTheDocument();
    expect(button()).toBeInTheDocument();
  });
});
