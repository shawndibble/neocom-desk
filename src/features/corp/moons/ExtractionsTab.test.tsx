import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ExtractionsTab } from './ExtractionsTab';

const tableProps = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));

vi.mock('@/components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui')>()),
  DataTable: (props: Record<string, unknown>) => {
    tableProps.calls.push(props);
    return null;
  },
}));
vi.mock('./ExtractionTimeline', () => ({ ExtractionTimeline: () => null }));
vi.mock('./useBook', () => ({
  useBook: () => ({
    view: {
      extractions: [
        { id: 'a', state: 'ready' },
        { id: 'b', state: 'fractured' },
      ],
    },
    names: { refinery: () => 'R', moon: () => 'M' },
  }),
}));

describe('ExtractionsTab on a phone', () => {
  it('offers the sort control with a count summary and pairs the card facts two per line', () => {
    render(
      <MemoryRouter>
        <ExtractionsTab />
      </MemoryRouter>
    );
    const props = tableProps.calls[0];
    expect(props.mobileSort).toBe(true);
    expect(props.stackColumns).toBe(2);
    expect(props.stackSummary).toBe('2 Extractions');
  });
});
