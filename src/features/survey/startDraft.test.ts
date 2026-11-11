import { describe, expect, it } from 'vitest';
import { EMPTY_START_DRAFT, draftFromTemplate, draftToInfo } from './startDraft';

describe('draftToInfo', () => {
  it('is an empty Survey for an empty draft', () => {
    expect(draftToInfo(EMPTY_START_DRAFT)).toEqual({ location: null, tax: null, notes: '' });
  });

  it('keeps the tax only with a payee and a valid rate', () => {
    const base = { ...EMPTY_START_DRAFT, payeeName: ' Bob Corp ' };
    expect(draftToInfo({ ...base, rateText: '5' }).tax).toEqual({ name: 'Bob Corp', pct: 5 });
    expect(draftToInfo({ ...base, rateText: '' }).tax).toBeNull();
    expect(draftToInfo({ ...base, rateText: '250' }).tax).toBeNull();
    expect(draftToInfo({ ...EMPTY_START_DRAFT, rateText: '5' }).tax).toBeNull();
  });
});

describe('draftFromTemplate', () => {
  it('fills the boxes from a saved template', () => {
    expect(
      draftFromTemplate({
        id: 't',
        name: 'Ashken Boost',
        location: { id: 1, name: 'Efa' },
        tax: { name: 'Bob Corp', pct: 7.5 },
        notes: 'Dock up',
      })
    ).toEqual({
      place: { id: 1, name: 'Efa' },
      payeeName: 'Bob Corp',
      rateText: '7.5',
      notes: 'Dock up',
    });
  });
});
