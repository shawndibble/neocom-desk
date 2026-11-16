import { describe, expect, it } from 'vitest';
import { taxMailRecipients } from './taxContact';

const CEO = 100;
const SENDER = 5;
const base = { ceoId: CEO, senderId: SENDER, senderListIds: [] as number[] };
const ch = (id: number) => ({ id, type: 'character' as const });

describe('taxMailRecipients', () => {
  it('mails the CEO when nothing is set', () => {
    expect(taxMailRecipients({ ...base, contact: undefined })).toEqual({
      recipients: [ch(CEO)],
      fellBackToCeo: false,
    });
  });

  it('mails nobody when the CEO is unknown or is the sender, and nothing else applies', () => {
    expect(taxMailRecipients({ ...base, contact: undefined, ceoId: null }).recipients).toEqual([]);
    expect(taxMailRecipients({ ...base, contact: undefined, ceoId: SENDER }).recipients).toEqual(
      []
    );
  });

  it('mails a mailing list when the sender is on it', () => {
    expect(
      taxMailRecipients({
        ...base,
        contact: { kind: 'mailingList', id: 7, name: 'Desk' },
        senderListIds: [3, 7],
      })
    ).toEqual({ recipients: [{ id: 7, type: 'mailing_list' }], fellBackToCeo: false });
  });

  it('mails the CEO instead when the sender is not on the list', () => {
    expect(
      taxMailRecipients({
        ...base,
        contact: { kind: 'mailingList', id: 7, name: 'Desk' },
        senderListIds: [3],
      })
    ).toEqual({ recipients: [ch(CEO)], fellBackToCeo: true });
  });

  it('does not claim a fall back when there is no CEO to fall back to', () => {
    expect(
      taxMailRecipients({
        ...base,
        ceoId: null,
        contact: { kind: 'mailingList', id: 7, name: 'Desk' },
      })
    ).toEqual({ recipients: [], fellBackToCeo: false });
  });

  it('mails each named officer once, never the sender', () => {
    expect(
      taxMailRecipients({
        ...base,
        contact: { kind: 'characters', ids: [11, SENDER, 12, 11] },
      })
    ).toEqual({ recipients: [ch(11), ch(12)], fellBackToCeo: false });
  });

  it('falls back to the CEO when the only named officer is the sender', () => {
    expect(taxMailRecipients({ ...base, contact: { kind: 'characters', ids: [SENDER] } })).toEqual({
      recipients: [ch(CEO)],
      fellBackToCeo: true,
    });
  });
});
