import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

/**
 * Substrings identifying each of the four ESI writes the app makes, one per
 * write. Every copy that claims to enumerate "the writes" must mention all
 * four, or the lists drift apart (settings.faq.store.local.description once
 * said "Three things" and omitted the Fitting write — see issue #1796).
 */
const WRITE_MARKERS = ['read in EVE', 'calendar invite', 'through your', 'Fitting to EVE'];

const FAQ_DESCRIPTION = en.settings.faq.store.local.description;
const LOGIN_WRITE_EXCEPTIONS = en.login.writeExceptions;
const LOGIN_TRUST_DESC = en.login.trust.readOnly.desc;

describe('write-exception copy names the same writes everywhere', () => {
  it.each(WRITE_MARKERS)('FAQ description mentions "%s"', (marker) => {
    expect(FAQ_DESCRIPTION).toContain(marker);
  });

  it.each(WRITE_MARKERS)('login writeExceptions mentions "%s"', (marker) => {
    expect(LOGIN_WRITE_EXCEPTIONS).toContain(marker);
  });

  it.each(WRITE_MARKERS)('login trust.readOnly.desc mentions "%s"', (marker) => {
    expect(LOGIN_TRUST_DESC).toContain(marker);
  });
});
