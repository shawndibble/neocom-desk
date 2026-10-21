import { describe, expect, it } from 'vitest';
import {
  TAKES_EFFECT_TOKEN,
  composeRemovalCancelledMail,
  composeRemovalMail,
  eveTimeLabel,
  fillTakesEffect,
  removalTakesEffectAt,
} from './removalMail';

const input = {
  accountingName: 'Brass Meridian Logistics',
  ownerName: 'Ostrava Salvage',
  officerName: 'Kestrel Vane',
  link: 'https://neocomdesk.com/corp-tax-book/remove-now/abc',
};

/** Words that would reveal money terms or the hidden payee guard. */
const FORBIDDEN = /miner rate|margin|rate|%|\bpercent|48|payee was|changed|feeder|collector/i;

describe('composeRemovalMail', () => {
  const mail = composeRemovalMail(input);
  it('says who started it, how to cancel and how to force it', () => {
    expect(mail.body).toContain('Kestrel Vane at Brass Meridian Logistics');
    expect(mail.body).toContain('Cancel removal');
    expect(mail.body).toContain('Leave');
    expect(mail.body).toContain(input.link);
    expect(mail.body).toContain(TAKES_EFFECT_TOKEN);
  });
  it('never mentions rates, margins, the guard or the developer terms', () => {
    expect(`${mail.subject}\n${mail.body}`).not.toMatch(FORBIDDEN);
  });
  it('says mining stops counting from the day it takes effect, not that it is still counted (#4617)', () => {
    expect(mail.body).not.toContain('still counted');
    expect(mail.body).toContain('from that day on is no longer counted');
  });
  it('leaves the link line out without a link', () => {
    expect(composeRemovalMail({ ...input, link: undefined as never }).body).not.toContain(
      'end it now here'
    );
  });
});

describe('composeRemovalCancelledMail', () => {
  const mail = composeRemovalCancelledMail(input);
  it('is short and names who cancelled', () => {
    expect(mail.body).toContain('Kestrel Vane');
    expect(mail.body.length).toBeLessThan(300);
  });
  it('never mentions rates, margins or the guard', () => {
    expect(`${mail.subject}\n${mail.body}`).not.toMatch(FORBIDDEN);
  });
});

describe('fillTakesEffect', () => {
  it('counts 24 hours from the send while the clock has not started', () => {
    const sentAt = Date.parse('2026-10-17T14:22:00Z');
    const body = fillTakesEffect(composeRemovalMail(input).body, removalTakesEffectAt({}, sentAt));
    expect(body).toContain(eveTimeLabel(Date.parse('2026-10-18T14:22:00Z')));
    expect(body).not.toContain(TAKES_EFFECT_TOKEN);
  });
  it('a later or retried copy states the recorded time, not its own send time (#4617)', () => {
    const effectiveAt = Date.parse('2026-10-18T14:22:00Z');
    const late = Date.parse('2026-10-17T18:00:00Z');
    expect(removalTakesEffectAt({ effectiveAt }, late)).toBe(effectiveAt);
  });
  it('formats an EVE time label', () => {
    expect(eveTimeLabel(Date.parse('2026-10-18T09:05:00Z'))).toBe('18 Oct 2026 09:05 EVE time');
  });
});
