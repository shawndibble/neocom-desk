import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

const WRITE_MARKERS = ['read in EVE', 'calendar invite', 'through your', 'Fitting to EVE'];

const FAQ_DESCRIPTION = en.settings.faq.store.notes.writes;
const LOGIN_TRUST_DESC = Object.values(en.login.trust.writes.items).join(' ');

describe('write-exception copy names the same writes everywhere', () => {
  it.each(WRITE_MARKERS)('FAQ writes answer mentions "%s"', (marker) => {
    expect(FAQ_DESCRIPTION).toContain(marker);
  });

  it.each(WRITE_MARKERS)('login trust writes list mentions "%s"', (marker) => {
    expect(LOGIN_TRUST_DESC).toContain(marker);
  });
});
