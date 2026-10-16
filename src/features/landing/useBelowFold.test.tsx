import { describe, it, expect, afterEach } from 'vitest';
import { useLayoutEffect } from 'react';
import { render } from '@testing-library/react';
import { useBelowFold } from './useBelowFold';

/** Records what each commit rendered: whether the below-the-fold sections were in it. */
function Probe({ ready, commits }: { ready: boolean; commits: boolean[] }) {
  const shown = useBelowFold(ready);
  useLayoutEffect(() => {
    commits.push(shown);
  });
  return null;
}

function renderProbe(ready: boolean, url = '/login') {
  window.history.replaceState({}, '', url);
  const commits: boolean[] = [];
  const view = render(<Probe ready={ready} commits={commits} />);
  return { commits, view };
}

afterEach(() => window.history.replaceState({}, '', '/'));

describe('useBelowFold', () => {
  it('leaves the below-the-fold sections out of the first commit and mounts them after', () => {
    const { commits } = renderProbe(true);
    expect(commits).toEqual([false, true]);
  });

  it('waits until the page is ready to render its hero', () => {
    const { commits, view } = renderProbe(false);
    expect(commits.every((shown) => !shown)).toBe(true);
    view.rerender(<Probe ready commits={commits} />);
    expect(commits.at(-1)).toBe(true);
  });

  it('mounts everything in the first commit when the URL names a landing section', () => {
    const { commits } = renderProbe(true, '/login#login-faq');
    expect(commits).toEqual([true]);
  });

  it('defers as usual for a hash that names no landing section', () => {
    expect(renderProbe(true, '/login#somewhere-else').commits).toEqual([false, true]);
    expect(renderProbe(true, '/login#100%').commits).toEqual([false, true]);
  });
});
