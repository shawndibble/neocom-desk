import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import * as download from '@/lib/download';
import { BookProvider } from './BookContext';
import { ExportBookSection, ExportFirst } from './ExportBook';
import type { BookContextValue } from './bookContextValue';

const readBookData = vi.fn();
const readAudit = vi.fn();
vi.mock('@/esi/endpoints/corp', () => ({
  getCorporationPublicInfo: () => Promise.resolve({ data: { ticker: 'TEST' } }),
}));
vi.mock('../taxBook/bookClient', () => ({
  readBookData: (...a: unknown[]) => readBookData(...a),
  readAudit: (...a: unknown[]) => readAudit(...a),
  readRebills: () => Promise.resolve([]),
  readDeclinedAutoGroup: () => Promise.resolve(new Set<number>()),
  editBook: vi.fn(),
}));

const CORP = 98000001;
const ME = 7;

const book = {
  settings: {
    active: true,
    startDate: '2026-01-01',
    divisions: [1],
    cadence: { kind: 'monthly' },
    rates: [],
  },
  state: {
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    extractions: [],
    paidStatementIds: new Set<string>(),
    writeOffs: [],
  },
  observed: [
    {
      structureId: 1,
      characterId: 2,
      recordedCorporationId: CORP,
      typeId: 3,
      date: '2026-03-01',
      quantity: 5,
      cachedAt: '2026-03-01T00:00:00Z',
    },
    {
      structureId: 1,
      characterId: 4,
      recordedCorporationId: CORP,
      typeId: 3,
      date: '2026-03-02',
      quantity: 6,
      cachedAt: '2026-03-02T00:00:00Z',
    },
  ],
  declarations: [],
  adjustments: [],
};

const names = {
  character: (id: number) => `Char ${id}`,
  corporation: (id: number) => `Corp ${id}`,
  refinery: (id: number) => `Refinery ${id}`,
  ownerRefinery: (id: number) => `Refinery ${id}`,
  moon: (id: number) => `Moon ${id}`,
  ore: (id: number) => `Ore ${id}`,
};

function renderIn(children: React.ReactNode) {
  render(
    <BookProvider
      value={
        {
          characterId: ME,
          corporationId: CORP,
          names,
          verdict: { canEdit: false },
          reload: vi.fn(),
        } as unknown as Omit<BookContextValue, 'edit' | 'canEdit'>
      }
    >
      {children}
    </BookProvider>
  );
}

const button = () => screen.getByRole('button', { name: 'Download the book (.xlsx)' });

beforeEach(() => {
  readBookData.mockReset().mockResolvedValue(book);
  readAudit
    .mockReset()
    .mockResolvedValue([{ id: 'a', at: 0, by: ME, byName: 'Me', action: 'turnOn', detail: {} }]);
  vi.restoreAllMocks();
});

describe('ExportBookSection', () => {
  it('re-reads the book and its whole log at the press, then names the file and its rows', async () => {
    const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    renderIn(<ExportBookSection />);
    expect(screen.getByRole('heading', { name: 'Export the book' })).toBeInTheDocument();
    await userEvent.click(button());
    const done = await screen.findByRole('status');
    expect(readBookData).toHaveBeenCalledWith(ME, CORP);
    expect(readAudit).toHaveBeenCalledWith(ME, CORP, 2000);
    expect(save.mock.calls[0][0]).toMatch(/^neocom-corp-tax-book-test-\d{4}-\d{2}-\d{2}\.xlsx$/);
    // 2 mining lines + 17 settings rows + 1 log entry.
    expect(done).toHaveTextContent(
      /^Downloaded neocom-corp-tax-book-test-.*\.xlsx · 17 sheets, 20 rows$/
    );
  });

  it('marks the file partial when the log read came back at its cap', async () => {
    const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    readAudit.mockResolvedValue(
      Array.from({ length: 2000 }, (_, i) => ({
        id: `a${i}`,
        at: i,
        by: ME,
        byName: 'Me',
        action: 'turnOn',
        detail: {},
      }))
    );
    renderIn(<ExportBookSection />);
    await userEvent.click(button());
    await screen.findByRole('status');
    expect(save.mock.calls[0][0]).toMatch(/-partial\.xlsx$/);
  });

  it('says so when the book cannot be read, and downloads nothing', async () => {
    const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    readAudit.mockRejectedValue(new Error('permission-denied'));
    renderIn(<ExportBookSection />);
    await userEvent.click(button());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't build the file. Try again."
    );
    expect(save).not.toHaveBeenCalled();
  });
});

describe('ExportFirst', () => {
  it('offers the same download under its own heading', () => {
    renderIn(<ExportFirst />);
    expect(screen.getByRole('heading', { name: 'Export first' })).toBeInTheDocument();
    expect(button()).toBeInTheDocument();
  });
});
