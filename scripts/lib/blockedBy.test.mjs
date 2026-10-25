import { describe, it, expect } from 'vitest';
import { blockedByRefs } from './blockedBy.mjs';

describe('blockedByRefs', () => {
  it('reads every listed blocker', () => {
    const body = '## Summary\nx\n\n## Blocked by\n\n- #5025\n- #5149 (shared fix)\n* #5172\n';
    expect(blockedByRefs(body)).toEqual([5025, 5149, 5172]);
  });

  it('stops at the next heading', () => {
    expect(blockedByRefs('## Blocked by\n- #1\n## Notes\nsee #2')).toEqual([1]);
  });

  it('ignores prose after the list, such as a parent idea (#5150)', () => {
    const body = '## Blocked by\n\n- #5025\n- #5176\n\nDesign: `x.md`. Parent idea: #5033.\n';
    expect(blockedByRefs(body)).toEqual([5025, 5176]);
  });

  it('reads a list item wrapped onto an indented continuation line', () => {
    expect(blockedByRefs('## Blocked by\n- #1 and, once that lands,\n  #2\n\nParent: #9')).toEqual([
      1, 2,
    ]);
  });

  it('reads an inline section with no list', () => {
    expect(blockedByRefs('## Blocked by\n\n#12 and #13\n\nLater note about #99')).toEqual([12, 13]);
  });

  it('is empty for None, an empty section, or no section', () => {
    expect(blockedByRefs('## Blocked by\n\nNone — can start immediately')).toEqual([]);
    expect(blockedByRefs('## Blocked by\n\n## Next')).toEqual([]);
    expect(blockedByRefs('## Summary\nrefers to #4')).toEqual([]);
    expect(blockedByRefs(null)).toEqual([]);
  });
});
