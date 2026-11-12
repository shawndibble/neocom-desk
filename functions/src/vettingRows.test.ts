import { describe, expect, it } from 'vitest';
import {
  capDealings,
  contactDealings,
  contractDealings,
  historyOf,
  mailDealings,
  skillsOf,
  walletDealings,
} from './vettingRows.js';

const ME = 2_100_000_001;
const PAL = 2_100_000_002;
const CORP = 98_000_010;

describe('walletDealings', () => {
  it('names the party that is not this character, keeping the signed amount', () => {
    expect(
      walletDealings(ME, [
        {
          first_party_id: ME,
          second_party_id: PAL,
          ref_type: 'player_donation',
          amount: -5,
          date: '2026-10-01T00:00:00Z',
        },
        {
          first_party_id: PAL,
          second_party_id: ME,
          ref_type: 'player_trading',
          amount: 7,
          date: '2026-10-02T00:00:00Z',
        },
      ])
    ).toEqual([
      {
        source: 'wallet',
        at: '2026-10-01T00:00:00Z',
        partyId: PAL,
        what: 'player_donation',
        amount: -5,
      },
      {
        source: 'wallet',
        at: '2026-10-02T00:00:00Z',
        partyId: PAL,
        what: 'player_trading',
        amount: 7,
      },
    ]);
  });

  it('skips rows with no other party, an NPC party, or no usable fields', () => {
    expect(
      walletDealings(ME, [
        {
          first_party_id: ME,
          ref_type: 'skill_purchase',
          amount: -1,
          date: '2026-10-01T00:00:00Z',
        },
        // CONCORD paying a bounty: an NPC corporation.
        {
          first_party_id: 1_000_125,
          second_party_id: ME,
          ref_type: 'bounty_prizes',
          amount: 9,
          date: '2026-10-01T00:00:00Z',
        },
        // Neither side is this character.
        {
          first_party_id: PAL,
          second_party_id: CORP,
          ref_type: 'x',
          amount: 1,
          date: '2026-10-01T00:00:00Z',
        },
        { first_party_id: ME, second_party_id: PAL, amount: 1, date: '2026-10-01T00:00:00Z' },
        { first_party_id: ME, second_party_id: ME, ref_type: 'x', date: '2026-10-01T00:00:00Z' },
        null,
        'junk',
      ])
    ).toEqual([]);
  });
});

describe('contactDealings', () => {
  it('keeps player contacts with their standing and no time', () => {
    expect(
      contactDealings([
        { contact_id: PAL, contact_type: 'character', standing: 10 },
        { contact_id: CORP, contact_type: 'corporation', standing: -5 },
        { contact_id: 500_001, contact_type: 'faction', standing: 5 },
        { contact_id: PAL },
      ])
    ).toEqual([
      { source: 'contact', at: null, partyId: PAL, what: 'contact', standing: 10 },
      { source: 'contact', at: null, partyId: CORP, what: 'contact', standing: -5 },
    ]);
  });
});

describe('mailDealings', () => {
  it('takes the sender of a mail received, and each recipient of a mail sent', () => {
    const rows = mailDealings(ME, [
      {
        mail_id: 1,
        from: PAL,
        subject: 'never kept',
        timestamp: '2026-10-01T00:00:00Z',
        recipients: [{ recipient_id: ME, recipient_type: 'character' }],
      },
      {
        mail_id: 2,
        from: ME,
        subject: 'never kept',
        timestamp: '2026-10-02T00:00:00Z',
        recipients: [
          { recipient_id: PAL, recipient_type: 'character' },
          { recipient_id: CORP, recipient_type: 'corporation' },
          { recipient_id: 145_000_000, recipient_type: 'mailing_list' },
          { recipient_id: ME, recipient_type: 'character' },
        ],
      },
    ]);
    expect(rows).toEqual([
      { source: 'mail', at: '2026-10-01T00:00:00Z', partyId: PAL, what: 'mail' },
      { source: 'mail', at: '2026-10-02T00:00:00Z', partyId: PAL, what: 'mail' },
      { source: 'mail', at: '2026-10-02T00:00:00Z', partyId: CORP, what: 'mail' },
    ]);
    expect(JSON.stringify(rows)).not.toContain('never kept');
  });
});

describe('contractDealings', () => {
  const base = { date_issued: '2026-10-01T00:00:00Z', type: 'item_exchange' };

  it('signs an item exchange from this character’s side', () => {
    expect(
      contractDealings(ME, [
        { ...base, issuer_id: ME, acceptor_id: PAL, price: 100, reward: 0 },
        { ...base, issuer_id: PAL, acceptor_id: ME, price: 100, reward: 0 },
        { ...base, issuer_id: PAL, acceptor_id: ME, price: 0, reward: 30 },
      ]).map((row) => [row.partyId, row.amount])
    ).toEqual([
      [PAL, 100],
      [PAL, -100],
      [PAL, 30],
    ]);
  });

  it('signs a courier reward, and leaves other types as given', () => {
    expect(
      contractDealings(ME, [
        { ...base, type: 'courier', issuer_id: ME, acceptor_id: PAL, price: 0, reward: 50 },
        { ...base, type: 'courier', issuer_id: PAL, acceptor_id: ME, price: 0, reward: 50 },
        { ...base, type: 'auction', issuer_id: PAL, acceptor_id: ME, price: 12 },
      ]).map((row) => [row.what, row.amount])
    ).toEqual([
      ['courier', -50],
      ['courier', 50],
      ['auction', 12],
    ]);
  });

  it('skips a contract nobody else is party to', () => {
    expect(
      contractDealings(ME, [
        { ...base, issuer_id: ME, acceptor_id: 0, price: 1 },
        { ...base, issuer_id: ME, acceptor_id: ME, price: 1 },
        { ...base, issuer_id: ME, acceptor_id: PAL },
      ])
    ).toEqual([{ source: 'contract', at: base.date_issued, partyId: PAL, what: 'item_exchange' }]);
  });

  it('takes the issuer when this character is only the assignee', () => {
    expect(
      contractDealings(ME, [{ ...base, issuer_id: PAL, acceptor_id: 0, assignee_id: ME, price: 5 }])
    ).toEqual([
      { source: 'contract', at: base.date_issued, partyId: PAL, what: 'item_exchange', amount: 5 },
    ]);
  });
});

describe('skillsOf', () => {
  it('reads total skill points and trained levels', () => {
    expect(
      skillsOf({
        total_sp: 5_000_000,
        skills: [{ skill_id: 21603, trained_skill_level: 4 }, { skill_id: 'x' }],
      })
    ).toEqual({ skillPoints: 5_000_000, skills: [{ id: 21603, level: 4 }] });
  });

  it('is null for a body that is not a skill sheet', () => {
    expect(skillsOf([])).toBeNull();
    expect(skillsOf({ skills: [] })).toBeNull();
  });
});

describe('historyOf', () => {
  it('keeps corporation and start date in ESI’s order', () => {
    expect(
      historyOf([
        { corporation_id: CORP, record_id: 2, start_date: '2026-01-01T00:00:00Z' },
        { corporation_id: 1_000_001, record_id: 1, start_date: '2020-01-01T00:00:00Z' },
        { record_id: 0 },
      ])
    ).toEqual([
      { corporationId: CORP, startDate: '2026-01-01T00:00:00Z' },
      { corporationId: 1_000_001, startDate: '2020-01-01T00:00:00Z' },
    ]);
  });
});

describe('capDealings', () => {
  it('keeps every contact, then the newest of the rest', () => {
    const dated = (day: number) => ({
      source: 'wallet' as const,
      at: `2026-10-0${day}T00:00:00Z`,
      partyId: PAL,
      what: 'x',
    });
    const contact = { source: 'contact' as const, at: null, partyId: PAL, what: 'contact' };
    expect(capDealings([dated(1), contact, dated(3), dated(2)], 3)).toEqual([
      contact,
      dated(3),
      dated(2),
    ]);
    expect(capDealings([dated(1), dated(2)], 5)).toEqual([dated(1), dated(2)]);
  });
});
