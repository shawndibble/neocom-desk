import { afterEach, describe, expect, it } from 'vitest';
import { firstConnected } from '@/lib/useFocusAfterCommit';
import { neighbourFocusCandidates, planRowHandle, PLAN_HANDLE_ATTR } from './focusNeighbour';

function mountHandles(...ids: string[]) {
  return ids.map((id) => {
    const button = document.createElement('button');
    button.setAttribute(PLAN_HANDLE_ATTR, id);
    document.body.append(button);
    return button;
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('planRowHandle', () => {
  it('finds the handle by row id, or null', () => {
    const [a] = mountHandles('1-1', '2-1');
    expect(planRowHandle('1-1')).toBe(a);
    expect(planRowHandle('9-9')).toBeNull();
  });
});

describe('neighbourFocusCandidates', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('prefers the next row, then the previous, then the fallback', () => {
    const heading = document.createElement('h2');
    document.body.append(heading);
    const [a, b, c] = mountHandles('a', 'b', 'c');
    expect(firstConnected(neighbourFocusCandidates(rows, 'b', heading))).toBe(c);
    expect(firstConnected(neighbourFocusCandidates(rows, 'c', heading))).toBe(b);
    b.remove();
    expect(firstConnected(neighbourFocusCandidates(rows, 'c', heading))).toBe(a);
  });

  it('falls back to the heading when no other row is mounted', () => {
    const heading = document.createElement('h2');
    document.body.append(heading);
    mountHandles('only');
    expect(firstConnected(neighbourFocusCandidates([{ id: 'only' }], 'only', heading))).toBe(
      heading
    );
  });

  it('skips a row that is gone in the same update', () => {
    const heading = document.createElement('h2');
    document.body.append(heading);
    expect(firstConnected(neighbourFocusCandidates(rows, 'a', heading))).toBe(heading);
  });
});
