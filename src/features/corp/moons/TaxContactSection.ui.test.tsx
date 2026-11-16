import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { TaxContactSection } from './TaxContactSection';
import type { TaxContactDraft } from './taxContactDraft';

vi.mock('@/features/character/mail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/character/mail')>()),
  loadMailingLists: () => Promise.resolve({ cached: { data: [] } }),
}));
vi.mock('@/features/corp/members', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/members')>()),
  loadCorporationCeoId: () => Promise.resolve(null),
}));
vi.mock('@/features/character/names', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/character/names')>()),
  resolveNames: () => new Promise(() => undefined),
}));

const draft = (over: Partial<TaxContactDraft> = {}): TaxContactDraft => ({
  mode: 'ceo',
  listId: null,
  listName: '',
  officerIds: [],
  ...over,
});

describe('TaxContactSection', () => {
  it('puts every mode radio inside a label, so the touch target is the row', () => {
    render(
      <TaxContactSection characterId={1} corporationId={2} draft={draft()} onChange={() => {}} />
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio.closest('label')).not.toBeNull();
    expect(screen.getByRole('radio', { name: /A mailing list/ })).toBeInTheDocument();
  });

  it('names a not-yet-resolved officer without a raw id', () => {
    render(
      <TaxContactSection
        characterId={1}
        corporationId={2}
        draft={draft({ mode: 'officers', officerIds: [42] })}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Character 42')).toBeInTheDocument();
    expect(screen.queryByText('#42')).toBeNull();
  });
});
