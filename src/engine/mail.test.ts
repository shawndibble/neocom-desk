import { describe, expect, it } from 'vitest';
import {
  buildCustomLabelList,
  buildLabelTabMap,
  capHeadersForDisplay,
  mailSearchMatches,
  mergeMailHeaderPage,
  resolveMailTab,
  unreadCountsByTab,
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

describe('buildCustomLabelList', () => {
  it('keeps a label whose name is not one of the four System Labels', () => {
    const list = buildCustomLabelList([
      { label_id: 1, name: 'Inbox' },
      { label_id: 100, name: 'Miners' },
    ]);
    expect(list).toEqual([{ label_id: 100, name: 'Miners' }]);
  });

  it('preserves extra fields (e.g. color) on the returned label', () => {
    const list = buildCustomLabelList([{ label_id: 100, name: 'Miners', color: '#ffaabb' }]);
    expect(list).toEqual([{ label_id: 100, name: 'Miners', color: '#ffaabb' }]);
  });

  it('omits all four System Labels', () => {
    const list = buildCustomLabelList([
      { label_id: 1, name: 'Inbox' },
      { label_id: 2, name: 'Sent' },
      { label_id: 3, name: 'Corp' },
      { label_id: 4, name: 'Alliance' },
    ]);
    expect(list).toEqual([]);
  });

  it('omits a label with no name (nothing to display as a filter)', () => {
    const list = buildCustomLabelList([{ label_id: 100 }]);
    expect(list).toEqual([]);
  });

  it('returns an empty list for a character with no custom labels', () => {
    expect(buildCustomLabelList([])).toEqual([]);
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
