import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_LENGTH,
  MAX_RECIPIENTS,
  MAX_SUBJECT_LENGTH,
  addRecipient,
  composeBodyLength,
  filterMailingLists,
  isNewMailEmpty,
  recipientKey,
  validateNewMail,
  type ComposeRecipient,
} from './mailCompose';

const c = (id: number): ComposeRecipient => ({
  recipient_id: id,
  recipient_type: 'character',
  name: `Pilot ${id}`,
});

describe('addRecipient', () => {
  it('appends a new recipient', () => {
    expect(addRecipient([], c(1))).toEqual({ ok: true, recipients: [c(1)] });
  });
  it('treats the same id of a different type as a different recipient', () => {
    const corp: ComposeRecipient = { recipient_id: 1, recipient_type: 'corporation', name: 'Corp' };
    const r = addRecipient([c(1)], corp);
    expect(r.ok).toBe(true);
    expect(r.recipients).toHaveLength(2);
  });
  it('ignores a duplicate', () => {
    expect(addRecipient([c(1)], c(1))).toEqual({
      ok: false,
      reason: 'duplicate',
      recipients: [c(1)],
    });
  });
  it('blocks past the ESI cap', () => {
    const full = Array.from({ length: MAX_RECIPIENTS }, (_, i) => c(i + 1));
    const r = addRecipient(full, c(999));
    expect(r).toMatchObject({ ok: false, reason: 'full' });
    expect(r.recipients).toHaveLength(MAX_RECIPIENTS);
  });
});

describe('recipientKey', () => {
  it('joins type and id', () => {
    expect(recipientKey(c(7))).toBe('character:7');
  });
});

describe('composeBodyLength', () => {
  it('counts raw characters', () => {
    expect(composeBodyLength('abc')).toBe(3);
  });

  it('counts markup, tags included', () => {
    expect(composeBodyLength('<b>hi</b>')).toBe(9);
  });
});

describe('validateNewMail', () => {
  const ok = { recipients: [c(1)], subject: 's', body: 'b' };
  it('passes a normal mail', () => {
    expect(validateNewMail(ok)).toEqual([]);
  });
  it('needs a recipient', () => {
    expect(validateNewMail({ ...ok, recipients: [] })).toEqual(['noRecipients']);
  });
  it('allows exactly the limits and blocks one past', () => {
    const edge = {
      ...ok,
      subject: 'x'.repeat(MAX_SUBJECT_LENGTH),
      body: 'x'.repeat(MAX_BODY_LENGTH),
    };
    expect(validateNewMail(edge)).toEqual([]);
    expect(validateNewMail({ ...ok, subject: 'x'.repeat(MAX_SUBJECT_LENGTH + 1) })).toEqual([
      'subjectTooLong',
    ]);
    expect(validateNewMail({ ...ok, body: 'x'.repeat(MAX_BODY_LENGTH + 1) })).toEqual([
      'bodyTooLong',
    ]);
  });
  it('flags too many recipients', () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => c(i + 1));
    expect(validateNewMail({ ...ok, recipients: many })).toEqual(['tooManyRecipients']);
  });
});

describe('isNewMailEmpty', () => {
  it('is empty only when nothing is filled in', () => {
    expect(isNewMailEmpty({ recipients: [], subject: '', body: '' })).toBe(true);
    expect(isNewMailEmpty({ recipients: [], subject: ' ', body: '\n' })).toBe(true);
    expect(isNewMailEmpty({ recipients: [c(1)], subject: '', body: '' })).toBe(false);
    expect(isNewMailEmpty({ recipients: [], subject: '', body: 'hi' })).toBe(false);
  });
});

describe('filterMailingLists', () => {
  const lists = [
    { mailing_list_id: 1, name: 'Alpha Chat' },
    { mailing_list_id: 2, name: 'Beta' },
    { mailing_list_id: 3, name: 'alphabet' },
  ];
  it('matches case-insensitively, by name, as mailing_list recipients', () => {
    const hits = filterMailingLists(lists, 'alph', []);
    expect(hits.map((r) => r.recipient_id)).toEqual([1, 3]);
    expect(hits[0]).toMatchObject({ recipient_type: 'mailing_list' });
  });
  it('lists all when the query is empty and skips ones already added', () => {
    const added: ComposeRecipient[] = [
      { recipient_id: 2, recipient_type: 'mailing_list', name: 'Beta' },
    ];
    expect(filterMailingLists(lists, '', added).map((r) => r.recipient_id)).toEqual([1, 3]);
  });
});
