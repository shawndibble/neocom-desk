import { describe, expect, it } from 'vitest';
import {
  rawContactRows,
  rawContractRows,
  rawHistoryRows,
  rawMailRows,
  rawSkillRows,
  rawWalletRows,
} from './vettingRawRows.js';

const ME = 2_100_000_001;
const PAL = 2_100_000_002;
const NPC = 1_000_125;

describe('rawWalletRows', () => {
  it('keeps every row, NPC parties and rows with no other side included', () => {
    const rows = rawWalletRows(ME, [
      {
        first_party_id: ME,
        second_party_id: PAL,
        ref_type: 'player_donation',
        amount: -5,
        date: 'd1',
      },
      {
        first_party_id: NPC,
        second_party_id: ME,
        ref_type: 'bounty_prizes',
        amount: 9,
        date: 'd2',
      },
      { first_party_id: ME, ref_type: 'transaction_tax', amount: -1, date: 'd3' },
      { first_party_id: ME, second_party_id: ME, ref_type: 'x', amount: 0, date: 'd4' },
      'junk',
    ]);
    expect(rows).toEqual([
      { characterId: ME, at: 'd1', what: 'player_donation', partyId: PAL, amount: -5 },
      { characterId: ME, at: 'd2', what: 'bounty_prizes', partyId: NPC, amount: 9 },
      { characterId: ME, at: 'd3', what: 'transaction_tax', amount: -1 },
      { characterId: ME, at: 'd4', what: 'x', amount: 0 },
    ]);
  });

  it('never carries the journal description or reason', () => {
    const [row] = rawWalletRows(ME, [
      {
        first_party_id: ME,
        second_party_id: PAL,
        ref_type: 't',
        date: 'd',
        description: 'secret',
        reason: 'secret',
      },
    ]);
    expect(JSON.stringify(row)).not.toContain('secret');
  });
});

describe('rawContactRows', () => {
  it('keeps every contact kind with its standing and no date', () => {
    expect(
      rawContactRows(ME, [
        { contact_id: PAL, contact_type: 'character', standing: -10 },
        { contact_id: 500_001, contact_type: 'faction', standing: 5 },
        { contact_id: NPC, contact_type: 'corporation' },
      ])
    ).toEqual([
      { characterId: ME, at: null, what: 'character', partyId: PAL, standing: -10 },
      { characterId: ME, at: null, what: 'faction', partyId: 500_001, standing: 5 },
      { characterId: ME, at: null, what: 'corporation', partyId: NPC },
    ]);
  });
});

describe('rawMailRows', () => {
  it('lists a received mail by its sender and every recipient id', () => {
    expect(
      rawMailRows(ME, [
        {
          from: PAL,
          timestamp: 't1',
          recipients: [
            { recipient_id: ME, recipient_type: 'character' },
            { recipient_id: 98_000_001, recipient_type: 'corporation' },
          ],
        },
      ])
    ).toEqual([
      { characterId: ME, at: 't1', what: 'Received', partyId: PAL, recipients: [ME, 98_000_001] },
    ]);
  });

  it('lists a sent mail by its first recipient', () => {
    expect(
      rawMailRows(ME, [
        {
          from: ME,
          timestamp: 't2',
          recipients: [
            { recipient_id: PAL, recipient_type: 'character' },
            { recipient_id: 98_000_001, recipient_type: 'mailing_list' },
          ],
        },
      ])
    ).toEqual([
      { characterId: ME, at: 't2', what: 'Sent', partyId: PAL, recipients: [PAL, 98_000_001] },
    ]);
  });

  it('never keeps a subject, a body or a mail id', () => {
    const rows = rawMailRows(ME, [
      {
        from: PAL,
        timestamp: 't',
        mail_id: 77,
        subject: 'WIRE 5b ISK TO ME',
        body: 'WIRE 5b ISK TO ME',
        is_read: true,
        labels: [1],
        recipients: [],
      },
    ]);
    const text = JSON.stringify(rows);
    expect(text).not.toContain('WIRE');
    expect(text).not.toContain('subject');
    expect(text).not.toContain('body');
    expect(rows[0]).toEqual({
      characterId: ME,
      at: 't',
      what: 'Received',
      partyId: PAL,
      recipients: [],
    });
  });
});

describe('rawContractRows', () => {
  it('keeps status and the signed amount, and every row even with no player on the other side', () => {
    expect(
      rawContractRows(ME, [
        {
          issuer_id: ME,
          acceptor_id: PAL,
          type: 'item_exchange',
          price: 100,
          reward: 0,
          date_issued: 'd1',
          status: 'finished',
        },
        {
          issuer_id: PAL,
          acceptor_id: ME,
          type: 'courier',
          reward: 40,
          date_issued: 'd2',
          status: 'outstanding',
        },
        {
          issuer_id: ME,
          acceptor_id: 0,
          type: 'auction',
          price: 7,
          date_issued: 'd3',
          status: 'expired',
          title: 'secret',
        },
      ])
    ).toEqual([
      {
        characterId: ME,
        at: 'd1',
        what: 'item_exchange',
        partyId: PAL,
        amount: 100,
        status: 'finished',
      },
      {
        characterId: ME,
        at: 'd2',
        what: 'courier',
        partyId: PAL,
        amount: 40,
        status: 'outstanding',
      },
      { characterId: ME, at: 'd3', what: 'auction', amount: 7, status: 'expired' },
    ]);
  });
});

describe('rawSkillRows', () => {
  it('has a row per skill with id and level', () => {
    expect(
      rawSkillRows(ME, {
        total_sp: 1,
        skills: [{ skill_id: 3300, trained_skill_level: 5 }, { nope: 1 }],
      })
    ).toEqual([{ characterId: ME, at: null, what: '', skillId: 3300, level: 5 }]);
  });
  it('is empty for a body that is not a sheet', () => {
    expect(rawSkillRows(ME, null)).toEqual([]);
  });
});

describe('rawHistoryRows', () => {
  it('derives left from the next newer stay, newest first, whatever order ESI sent', () => {
    expect(
      rawHistoryRows(ME, [
        { corporation_id: 3, start_date: '2026-03-01T00:00:00Z' },
        { corporation_id: 1, start_date: '2024-01-01T00:00:00Z' },
        { corporation_id: 2, start_date: '2025-02-01T00:00:00Z' },
      ])
    ).toEqual([
      {
        characterId: ME,
        at: '2026-03-01T00:00:00Z',
        what: '',
        corporationId: 3,
        joined: '2026-03-01T00:00:00Z',
        left: null,
      },
      {
        characterId: ME,
        at: '2025-02-01T00:00:00Z',
        what: '',
        corporationId: 2,
        joined: '2025-02-01T00:00:00Z',
        left: '2026-03-01T00:00:00Z',
      },
      {
        characterId: ME,
        at: '2024-01-01T00:00:00Z',
        what: '',
        corporationId: 1,
        joined: '2024-01-01T00:00:00Z',
        left: '2025-02-01T00:00:00Z',
      },
    ]);
  });
});
