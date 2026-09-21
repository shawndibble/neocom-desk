import { describe, expect, it } from 'vitest';
import {
  buildLabelTabMap,
  buildReplyAllRecipients,
  capHeadersForDisplay,
  mailSearchMatches,
  mergeMailHeaderPage,
  parseMailFolders,
  prefixSubject,
  quoteMailBody,
  resolveMailTab,
  unreadCountsByTab,
  MAIL_FOLDERS,
} from './mail';

describe('buildLabelTabMap', () => {
  it('maps each recognized System Label name to its tab, case-insensitively', () => {
    const map = buildLabelTabMap([
      { label_id: 1, name: 'Inbox' },
      { label_id: 2, name: 'Sent' },
      { label_id: 3, name: 'CORP' },
      { label_id: 4, name: 'alliance' },
    ]);
    expect(map.get(1)).toBe('inbox');
    expect(map.get(2)).toBe('sent');
    expect(map.get(3)).toBe('corp');
    expect(map.get(4)).toBe('alliance');
  });

  it('omits a Custom Label (unrecognized name) from the map', () => {
    const map = buildLabelTabMap([
      { label_id: 1, name: 'Inbox' },
      { label_id: 100, name: 'Miners' },
    ]);
    expect(map.has(100)).toBe(false);
    expect(map.size).toBe(1);
  });

  it('omits a label with no name', () => {
    const map = buildLabelTabMap([{ label_id: 100 }]);
    expect(map.size).toBe(0);
  });
});

describe('resolveMailTab', () => {
  const labelTabById = buildLabelTabMap([
    { label_id: 1, name: 'Inbox' },
    { label_id: 2, name: 'Sent' },
    { label_id: 3, name: 'Corp' },
    { label_id: 4, name: 'Alliance' },
  ]);

  it('resolves a single recognized label to its tab', () => {
    expect(resolveMailTab([3], labelTabById)).toBe('corp');
  });

  it('folds an empty labels array into inbox', () => {
    expect(resolveMailTab([], labelTabById)).toBe('inbox');
  });

  it('folds undefined labels into inbox', () => {
    expect(resolveMailTab(undefined, labelTabById)).toBe('inbox');
  });

  it('folds a Custom Label id (not in the map) into inbox', () => {
    expect(resolveMailTab([100], labelTabById)).toBe('inbox');
  });

  it('prefers Sent over Alliance and Corp when a header carries more than one System Label', () => {
    expect(resolveMailTab([1, 2, 3, 4], labelTabById)).toBe('sent');
  });

  it('prefers Alliance over Corp and Inbox', () => {
    expect(resolveMailTab([1, 3, 4], labelTabById)).toBe('alliance');
  });

  it('prefers Corp over Inbox', () => {
    expect(resolveMailTab([1, 3], labelTabById)).toBe('corp');
  });
});

describe('unreadCountsByTab', () => {
  it('maps each recognized System Label to its own unread_count', () => {
    const map = unreadCountsByTab([
      { label_id: 1, name: 'Inbox', unread_count: 5 },
      { label_id: 3, name: 'Corp', unread_count: 0 },
      { label_id: 4, name: 'Alliance', unread_count: 2 },
    ]);
    expect(map.get('inbox')).toBe(5);
    expect(map.get('corp')).toBe(0);
    expect(map.get('alliance')).toBe(2);
    expect(map.has('sent')).toBe(false);
  });

  it('ignores a Custom Label', () => {
    const map = unreadCountsByTab([{ label_id: 100, name: 'Miners', unread_count: 9 }]);
    expect(map.size).toBe(0);
  });

  it('defaults a missing unread_count to 0', () => {
    const map = unreadCountsByTab([{ label_id: 1, name: 'Inbox' }]);
    expect(map.get('inbox')).toBe(0);
  });
});

describe('mergeMailHeaderPage', () => {
  it('appends a new page to the existing list', () => {
    const existing = [{ mail_id: 5 }, { mail_id: 4 }];
    const page = [{ mail_id: 3 }, { mail_id: 2 }];
    const result = mergeMailHeaderPage(existing, page, 2);
    expect(result.headers).toEqual([
      { mail_id: 5 },
      { mail_id: 4 },
      { mail_id: 3 },
      { mail_id: 2 },
    ]);
  });

  it('dedupes by mail_id when a page overlaps the existing list', () => {
    const existing = [{ mail_id: 5 }, { mail_id: 4 }];
    const page = [{ mail_id: 4 }, { mail_id: 3 }];
    const result = mergeMailHeaderPage(existing, page, 2);
    expect(result.headers).toEqual([{ mail_id: 5 }, { mail_id: 4 }, { mail_id: 3 }]);
  });

  it('reports hasMore true when the page came back at the page size cap', () => {
    const result = mergeMailHeaderPage([], [{ mail_id: 1 }, { mail_id: 2 }], 2);
    expect(result.hasMore).toBe(true);
  });

  it('reports hasMore false when the page came back short of the cap', () => {
    const result = mergeMailHeaderPage([{ mail_id: 5 }], [{ mail_id: 1 }], 2);
    expect(result.hasMore).toBe(false);
  });

  it('reports hasMore false for an empty page (exhausted)', () => {
    const result = mergeMailHeaderPage([{ mail_id: 5 }], [], 2);
    expect(result.hasMore).toBe(false);
  });

  it('defaults the page size to 50', () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ mail_id: i }));
    expect(mergeMailHeaderPage([], page).hasMore).toBe(true);
  });
});

describe('mailSearchMatches', () => {
  const header = { subject: 'Fleet up now', from: 1 } as const;

  it('matches on subject substring, case-insensitively', () => {
    expect(mailSearchMatches(header, 'Sender Name', 'FLEET')).toBe(true);
    expect(mailSearchMatches(header, 'Sender Name', 'market')).toBe(false);
  });

  it('matches on sender name substring, case-insensitively', () => {
    expect(mailSearchMatches(header, 'Fleet Commander', 'commander')).toBe(true);
  });

  it('treats an undefined sender name as no match for that half', () => {
    expect(mailSearchMatches(header, undefined, 'commander')).toBe(false);
  });

  it('treats a blank query as matching everything', () => {
    expect(mailSearchMatches(header, undefined, '')).toBe(true);
    expect(mailSearchMatches(header, undefined, '   ')).toBe(true);
  });

  it('matches a header with no subject only via the sender', () => {
    expect(mailSearchMatches({ subject: undefined }, 'Fleet Commander', 'fleet')).toBe(true);
    expect(mailSearchMatches({ subject: undefined }, undefined, 'fleet')).toBe(false);
  });
});

describe('capHeadersForDisplay', () => {
  it('returns the list unchanged, not truncated, when at or under the cap', () => {
    const headers = [{ mail_id: 1 }, { mail_id: 2 }];
    const result = capHeadersForDisplay(headers, 2);
    expect(result).toEqual({ headers, truncated: false });
  });

  it('keeps only the first `cap` entries (caller-ordered) and marks truncated', () => {
    const headers = [{ mail_id: 1 }, { mail_id: 2 }, { mail_id: 3 }];
    const result = capHeadersForDisplay(headers, 2);
    expect(result.headers.map((h) => h.mail_id)).toEqual([1, 2]);
    expect(result.truncated).toBe(true);
  });

  it('defaults to MAIL_HEADER_DISPLAY_CAP', () => {
    const headers = Array.from({ length: 10 }, (_, i) => ({ mail_id: i }));
    expect(capHeadersForDisplay(headers).truncated).toBe(false);
  });
});

describe('MAIL_FOLDERS', () => {
  it('lists the four System Label folders in display order', () => {
    expect(MAIL_FOLDERS).toEqual(['inbox', 'corp', 'alliance', 'sent']);
  });
});

describe('parseMailFolders', () => {
  it('accepts a stored array of recognized folder names', () => {
    expect(parseMailFolders(['inbox', 'corp', 'alliance'])).toEqual(['inbox', 'corp', 'alliance']);
  });

  it('rejects a non-array, an empty array, and an unrecognized member', () => {
    expect(parseMailFolders('inbox')).toBeNull();
    expect(parseMailFolders([])).toBeNull();
    expect(parseMailFolders(['inbox', 'drafts'])).toBeNull();
  });
});

describe('buildReplyAllRecipients', () => {
  const OWN_ID = 100;

  it('includes the sender plus every original recipient except self, sender not removable', () => {
    const result = buildReplyAllRecipients(
      {
        from: 200,
        recipients: [
          { recipient_id: OWN_ID, recipient_type: 'character' },
          { recipient_id: 300, recipient_type: 'character' },
        ],
      },
      OWN_ID
    );
    expect(result).toEqual([
      { recipient_id: 200, recipient_type: 'character', removable: false },
      { recipient_id: 300, recipient_type: 'character', removable: true },
    ]);
  });

  it('includes a mailing_list recipient, same as any other type', () => {
    const result = buildReplyAllRecipients(
      {
        from: 200,
        recipients: [{ recipient_id: 900, recipient_type: 'mailing_list' }],
      },
      OWN_ID
    );
    expect(result).toEqual([
      { recipient_id: 200, recipient_type: 'character', removable: false },
      { recipient_id: 900, recipient_type: 'mailing_list', removable: true },
    ]);
  });

  it('replying to your own Sent mail has no sender to pin — every original recipient is removable', () => {
    const result = buildReplyAllRecipients(
      {
        from: OWN_ID,
        recipients: [{ recipient_id: 300, recipient_type: 'character' }],
      },
      OWN_ID
    );
    expect(result).toEqual([{ recipient_id: 300, recipient_type: 'character', removable: true }]);
  });

  it('dedupes a recipient who is also the sender (rare, but ESI does not forbid it)', () => {
    const result = buildReplyAllRecipients(
      {
        from: 200,
        recipients: [{ recipient_id: 200, recipient_type: 'character' }],
      },
      OWN_ID
    );
    expect(result).toEqual([{ recipient_id: 200, recipient_type: 'character', removable: false }]);
  });

  it('drops a header with no sender and no recipients to an empty list', () => {
    expect(buildReplyAllRecipients({}, OWN_ID)).toEqual([]);
  });
});

describe('prefixSubject', () => {
  it('prepends "RE:" for a reply', () => {
    expect(prefixSubject('reply', 'Ratting fleet up')).toBe('RE: Ratting fleet up');
  });

  it('prepends "FWD:" for a forward', () => {
    expect(prefixSubject('forward', 'Ratting fleet up')).toBe('FWD: Ratting fleet up');
  });

  it('does not double-prefix a reply that already reads RE:, case-insensitively', () => {
    expect(prefixSubject('reply', 'RE: Ratting fleet up')).toBe('RE: Ratting fleet up');
    expect(prefixSubject('reply', 're: Ratting fleet up')).toBe('re: Ratting fleet up');
  });

  it('does not double-prefix a forward that already reads FWD:', () => {
    expect(prefixSubject('forward', 'FWD: Ratting fleet up')).toBe('FWD: Ratting fleet up');
  });

  it('still prefixes FWD: onto an existing RE: (crossing the two is allowed)', () => {
    expect(prefixSubject('forward', 'RE: Ratting fleet up')).toBe('FWD: RE: Ratting fleet up');
  });

  it('prefixes a blank subject rather than producing a bare prefix with trailing space', () => {
    expect(prefixSubject('reply', '')).toBe('RE:');
  });
});

describe('quoteMailBody', () => {
  it('quotes every line of the body with "> ", headed by sender and timestamp', () => {
    expect(quoteMailBody('Aura', 'Sep 21, 2026 03:14', 'line one\nline two')).toBe(
      '\n\nOn Sep 21, 2026 03:14, Aura wrote:\n> line one\n> line two'
    );
  });

  it('quotes a blank line as a bare ">", not "> " with a trailing space', () => {
    expect(quoteMailBody('Aura', 'Sep 21, 2026 03:14', 'line one\n\nline two')).toBe(
      '\n\nOn Sep 21, 2026 03:14, Aura wrote:\n> line one\n>\n> line two'
    );
  });

  it('quotes an empty body as just the attribution line', () => {
    expect(quoteMailBody('Aura', 'Sep 21, 2026 03:14', '')).toBe(
      '\n\nOn Sep 21, 2026 03:14, Aura wrote:\n>'
    );
  });
});
