import { describe, it, expect, vi, afterEach } from 'vitest';
import { Suspense, useLayoutEffect, useMemo, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { boolParam, enumSetParam, orderedIdListParam, textParam } from './urlState';
import {
  useRememberedUrlParams,
  useUrlFilter,
  useUrlParam,
  useUrlParams,
  useUrlSort,
} from './useUrlState';

const TYPES = ['a', 'b', 'c'] as const;
const SCHEMA = { q: textParam(), types: enumSetParam(TYPES), only: boolParam() };

function Probe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <output data-testid="probe">
      {location.pathname}
      {location.search}|{navigationType}
    </output>
  );
}

function Filters() {
  const [values, setValues] = useUrlParams(SCHEMA);
  return (
    <div>
      <input
        aria-label="search"
        value={values.q}
        onChange={(event) => setValues({ ...values, q: event.target.value })}
      />
      <button
        type="button"
        onClick={() => {
          const next = new Set(values.types);
          if (next.has('b')) next.delete('b');
          else next.add('b');
          // The whole object, as a filter bar passes it: text unchanged.
          setValues({ q: values.q, types: next, only: values.only });
        }}
      >
        toggle b
      </button>
      <button type="button" onClick={() => setValues({ only: !values.only })}>
        toggle only
      </button>
      <span data-testid="types">{[...values.types].join(',')}</span>
      <span data-testid="only">{String(values.only)}</span>
    </div>
  );
}

function renderAt(initial: string, ui = <Filters />) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              {ui}
              <Probe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

const probe = () => screen.getByTestId('probe').textContent;

afterEach(() => {
  vi.useRealTimers();
});

describe('useUrlParams', () => {
  it('reads values from the URL and falls back to defaults for absent or garbage keys', () => {
    renderAt('/p?q=hello&types=zzz&only=1');
    expect(screen.getByLabelText('search')).toHaveValue('hello');
    expect(screen.getByTestId('types')).toHaveTextContent('a,b,c');
    expect(screen.getByTestId('only')).toHaveTextContent('true');
  });

  it('writes a click immediately, as a replace, leaving defaults out', async () => {
    const user = userEvent.setup();
    renderAt('/p');
    await user.click(screen.getByRole('button', { name: 'toggle b' }));
    expect(probe()).toBe('/p?types=a%2Cc|REPLACE');
    await user.click(screen.getByRole('button', { name: 'toggle b' }));
    // Back to every member: the default, so the key is gone again.
    expect(probe()).toBe('/p|REPLACE');
  });

  it('debounces text, showing it immediately but writing once typing pauses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('/p');
    await user.type(screen.getByLabelText('search'), 'abc');
    expect(screen.getByLabelText('search')).toHaveValue('abc');
    expect(probe()).toBe('/p|POP');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(probe()).toBe('/p?q=abc|REPLACE');
  });

  it('flushes pending text together with a non-text change, in one write', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('/p');
    await user.type(screen.getByLabelText('search'), 'x');
    await user.click(screen.getByRole('button', { name: 'toggle only' }));
    expect(probe()).toBe('/p?q=x&only=1|REPLACE');
  });

  it('keeps the debounce when a filter bar resends unchanged non-text values', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('/p?types=a');
    // Each keystroke passes `types` along unchanged; it must not force a write.
    await user.type(screen.getByLabelText('search'), 'zz');
    expect(probe()).toBe('/p?types=a|POP');
  });

  it('preserves keys it does not own', async () => {
    const user = userEvent.setup();
    renderAt('/p?type=34&hub=jita');
    await user.click(screen.getByRole('button', { name: 'toggle only' }));
    expect(probe()).toBe('/p?type=34&hub=jita&only=1|REPLACE');
  });
});

const ONLY = boolParam();
function Single() {
  const [only, setOnly] = useUrlParam('panel.only', ONLY);
  return (
    <button type="button" onClick={() => setOnly(!only)}>
      only {String(only)}
    </button>
  );
}

describe('useUrlParam', () => {
  it('scopes a single value to its own key', async () => {
    const user = userEvent.setup();
    renderAt('/p', <Single />);
    await user.click(screen.getByRole('button', { name: 'only false' }));
    expect(probe()).toBe('/p?panel.only=1|REPLACE');
    expect(screen.getByRole('button', { name: 'only true' })).toBeInTheDocument();
  });
});

function Pushing() {
  const [only, setOnly] = useUrlParam('panel.only', ONLY);
  return (
    <button type="button" onClick={() => setOnly(!only, { push: true })}>
      push {String(only)}
    </button>
  );
}

describe('useUrlParam push', () => {
  it('pushes a history entry when asked, so Back returns to the previous value', async () => {
    const user = userEvent.setup();
    renderAt('/p', <Pushing />);
    await user.click(screen.getByRole('button', { name: 'push false' }));
    expect(probe()).toBe('/p?panel.only=1|PUSH');
  });
});

const DEFAULT_SORT = { columnId: 'name', direction: 'asc' } as const;
const COLUMNS = ['name', 'value'];
function Sorted() {
  const { sort, onSortChange } = useUrlSort('sort', DEFAULT_SORT, COLUMNS);
  return (
    <button type="button" onClick={() => onSortChange({ columnId: 'value', direction: 'desc' })}>
      {sort.columnId}:{sort.direction}
    </button>
  );
}

describe('useUrlSort', () => {
  it('falls back to the default for a column the table lacks', () => {
    renderAt('/p?sort=bogus:desc', <Sorted />);
    expect(screen.getByRole('button')).toHaveTextContent('name:asc');
  });

  it('writes a non-default sort', async () => {
    const user = userEvent.setup();
    renderAt('/p', <Sorted />);
    await user.click(screen.getByRole('button'));
    expect(probe()).toBe('/p?sort=value%3Adesc|REPLACE');
    expect(screen.getByRole('button')).toHaveTextContent('value:desc');
  });
});

interface TestFilter {
  text: string;
  flag: boolean;
}
const FILTER_SCHEMA = { 'f.text': textParam(), 'f.flag': boolParam() };
const EMPTY_FILTER_PARAMS = { 'f.text': '', 'f.flag': false } as const;
const FILTER_FIELD_TO_PARAM: Record<keyof TestFilter, string> = { text: 'f.text', flag: 'f.flag' };

function Filtered({ scope }: { scope: string }) {
  const [filter, setFilter] = useUrlFilter<TestFilter>(
    scope,
    FILTER_SCHEMA,
    FILTER_FIELD_TO_PARAM,
    EMPTY_FILTER_PARAMS
  );
  return (
    <input
      aria-label="text"
      value={filter.text}
      onChange={(event) => setFilter({ ...filter, text: event.target.value })}
    />
  );
}

describe('useUrlFilter', () => {
  it('reads a filter the URL already carries, without wiping it on mount', () => {
    renderAt('/p?f.text=foo', <Filtered scope="a" />);
    expect(screen.getByLabelText('text')).toHaveValue('foo');
  });

  it('resets to empty when scope changes after mount, not before', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/p?f.text=foo']}>
        <Routes>
          <Route path="*" element={<Filtered scope="a" />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByLabelText('text')).toHaveValue('foo');

    rerender(
      <MemoryRouter initialEntries={['/p?f.text=foo']}>
        <Routes>
          <Route path="*" element={<Filtered scope="b" />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByLabelText('text')).toHaveValue(''));
  });

  it('hands row derivation a deferred copy, so a keystroke paints the input first', async () => {
    const seen: [string, string][] = [];
    function Deferred() {
      const [filter, setFilter, rowsFilter] = useUrlFilter<TestFilter>(
        'a',
        FILTER_SCHEMA,
        FILTER_FIELD_TO_PARAM,
        EMPTY_FILTER_PARAMS
      );
      seen.push([filter.text, rowsFilter.text]);
      return (
        <input
          aria-label="text"
          value={filter.text}
          onChange={(event) => setFilter({ ...filter, text: event.target.value })}
        />
      );
    }
    const user = userEvent.setup();
    renderAt('/p', <Deferred />);
    await user.type(screen.getByLabelText('text'), 'x');
    // Some render showed the typed text in the box while rows still read the old filter...
    expect(seen).toContainEqual(['x', '']);
    // ...and the rows caught up once React got to the deferred pass.
    expect(seen.at(-1)).toEqual(['x', 'x']);
  });
});

describe('useRememberedUrlParams', () => {
  /** `q` is URL-only; `max` and `only` have a remembered default behind them. */
  const GROUP = { q: textParam(), max: textParam(), only: boolParam() };
  type Stored = { max: string; only: boolean };
  type GroupValues = { q: string; max: string; only: boolean };

  interface HarnessProps {
    initial: Stored;
    hydrated?: boolean;
    adoptLinked?: boolean;
    accepts?: (key: keyof typeof GROUP, value: unknown) => boolean;
    onRemember?: (patch: Partial<GroupValues>) => void;
  }

  function Remembered({
    initial,
    hydrated = true,
    adoptLinked,
    accepts,
    onRemember,
  }: HarnessProps) {
    const [stored, setStored] = useState<Stored>(initial);
    const remembered = useMemo(
      () => ({
        values: { max: stored.max, only: stored.only },
        hydrated,
        adoptLinked,
        accepts,
        remember: (patch: Partial<GroupValues>) => {
          onRemember?.(patch);
          setStored((current) => ({ ...current, ...patch }));
        },
      }),
      [stored, hydrated, adoptLinked, accepts, onRemember]
    );
    const [values, setValues, linked] = useRememberedUrlParams(GROUP, remembered);
    return (
      <div>
        <input
          aria-label="max"
          value={values.max}
          onChange={(event) => setValues({ ...values, max: event.target.value })}
        />
        {/* The whole object, as a filter bar commits it. */}
        <button type="button" onClick={() => setValues({ ...values, only: !values.only })}>
          toggle only
        </button>
        <span data-testid="only">{String(values.only)}</span>
        <span data-testid="stored">{`${stored.max}|${String(stored.only)}`}</span>
        <span data-testid="linked">{String(linked('max'))}</span>
      </div>
    );
  }

  function renderRemembered(initial: string, props: HarnessProps) {
    const tree = (next: HarnessProps) => (
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <Remembered {...next} />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    const view = render(tree(props));
    return { rerender: (next: HarnessProps) => view.rerender(tree(next)) };
  }

  const stored = () => screen.getByTestId('stored').textContent;

  it('reads a field the URL states over its stored default', () => {
    renderRemembered('/p?max=10', { initial: { max: '50', only: false } });
    expect(screen.getByLabelText('max')).toHaveValue('10');
    expect(screen.getByTestId('linked')).toHaveTextContent('true');
  });

  it('reads the stored default for a field the URL leaves out, without writing it into the URL', () => {
    renderRemembered('/p', { initial: { max: '50', only: true } });
    expect(screen.getByLabelText('max')).toHaveValue('50');
    expect(screen.getByTestId('only')).toHaveTextContent('true');
    expect(screen.getByTestId('linked')).toHaveTextContent('false');
    expect(probe()).toBe('/p|POP');
  });

  it('writes an edited field to both the URL and the stored default', async () => {
    const user = userEvent.setup();
    renderRemembered('/p', { initial: { max: '', only: false } });

    await user.type(screen.getByLabelText('max'), '7');

    expect(stored()).toBe('7|false');
    await waitFor(() => expect(probe()).toBe('/p?max=7|REPLACE'));
  });

  it("never copies an untouched field's URL value into storage", async () => {
    const onRemember = vi.fn();
    const user = userEvent.setup();
    renderRemembered('/p?only=1', { initial: { max: '', only: false }, onRemember });

    await user.type(screen.getByLabelText('max'), '7');

    expect(onRemember).toHaveBeenCalledWith({ max: '7' });
    expect(onRemember.mock.calls.every(([patch]) => !('only' in patch))).toBe(true);
    expect(stored()).toBe('7|false');
  });

  it('never adds a URL param for an untouched field read from the stored default', async () => {
    const user = userEvent.setup();
    renderRemembered('/p', { initial: { max: '50', only: false } });

    await user.click(screen.getByRole('button', { name: 'toggle only' }));

    await waitFor(() => expect(probe()).toBe('/p?only=1|REPLACE'));
    expect(stored()).toBe('50|true');
  });

  it('keeps a deep link over the stored default on first render and after hydration', () => {
    const onRemember = vi.fn();
    const { rerender } = renderRemembered('/p?max=10', {
      initial: { max: '50', only: false },
      hydrated: false,
      onRemember,
    });
    expect(screen.getByLabelText('max')).toHaveValue('10');

    rerender({ initial: { max: '50', only: false }, hydrated: true, onRemember });

    expect(screen.getByLabelText('max')).toHaveValue('10');
    expect(probe()).toBe('/p?max=10|POP');
    expect(onRemember).not.toHaveBeenCalled();
  });

  it('adopts a linked value into storage once hydrated, only when opted in', () => {
    const onRemember = vi.fn();
    const props = { initial: { max: '50', only: false }, adoptLinked: true, onRemember };
    const { rerender } = renderRemembered('/p?max=10&q=jita', { ...props, hydrated: false });
    expect(onRemember).not.toHaveBeenCalled();

    rerender({ ...props, hydrated: true });

    // `q` has no stored default, so there is nothing to adopt it into.
    expect(onRemember).toHaveBeenCalledTimes(1);
    expect(onRemember).toHaveBeenCalledWith({ max: '10' });
    expect(stored()).toBe('10|false');
    expect(probe()).toBe('/p?max=10&q=jita|POP');
  });

  it('reads a linked value the caller rejects as absent, and never adopts it', () => {
    const onRemember = vi.fn();
    renderRemembered('/p?max=bad', {
      initial: { max: '50', only: false },
      adoptLinked: true,
      accepts: (_key, value) => value !== 'bad',
      onRemember,
    });

    expect(screen.getByLabelText('max')).toHaveValue('50');
    expect(screen.getByTestId('linked')).toHaveTextContent('false');
    expect(onRemember).not.toHaveBeenCalled();
  });
});

const IDS = orderedIdListParam();
/** Holds every navigation's transition open until `release` runs: a slow page's render. */
const hold: {
  promise: Promise<void> | null;
  release: () => void;
  /** Hold every move off this entry; unset, hold any move to a non-empty search. */
  fromKey?: string;
  shownKey?: string;
} = {
  promise: null,
  release: () => {},
};
function holdNavigations({ offShown = false } = {}) {
  hold.fromKey = offShown ? hold.shownKey : undefined;
  hold.promise = new Promise((resolve) => {
    hold.release = () => {
      hold.promise = null;
      resolve();
    };
  });
}
function HoldNavigation() {
  const { search, key } = useLocation();
  const held = hold.fromKey === undefined ? search !== '' : key !== hold.fromKey;
  // Thrown, not `use`d: under `use` the held transition never landed after release.
  useLayoutEffect(() => {
    hold.shownKey = key;
  });
  if (held && hold.promise) throw hold.promise;
  return null;
}
function Appending() {
  const [ids, setIds] = useUrlParam('ids', IDS);
  return (
    <div>
      <button type="button" onClick={() => setIds([...ids, 1])}>
        add 1
      </button>
      <button type="button" onClick={() => setIds([...ids, 2])}>
        add 2
      </button>
      <span data-testid="ids">{ids.join(',')}</span>
      <Suspense>
        <HoldNavigation />
      </Suspense>
    </div>
  );
}

describe('useUrlParam immediate writes', () => {
  afterEach(() => {
    hold.release();
  });

  it('shows a write before its navigation commits, so the next pick builds on it', async () => {
    holdNavigations();
    const user = userEvent.setup();
    renderAt('/p', <Appending />);
    await user.click(screen.getByRole('button', { name: 'add 1' }));
    expect(screen.getByTestId('ids').textContent).toBe('1');
    await user.click(screen.getByRole('button', { name: 'add 2' }));
    expect(screen.getByTestId('ids').textContent).toBe('1,2');

    await act(async () => hold.release());
    await waitFor(() => expect(probe()).toBe(`/p?ids=${encodeURIComponent('1,2')}|REPLACE`));
    expect(screen.getByTestId('ids').textContent).toBe('1,2');
  });
});

const FLAG = boolParam();
function FlagButton({ name }: { name: string }) {
  const [on, setOn] = useUrlParam(name, FLAG);
  return (
    <button type="button" onClick={() => setOn(!on)}>
      {name} {String(on)}
    </button>
  );
}

function PushThenBack() {
  const [a, setA] = useUrlParam('a', FLAG);
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => setA(!a, { push: true })}>
        push a
      </button>
      <button type="button" onClick={() => void navigate(-1)}>
        back
      </button>
    </>
  );
}

describe('useUrlParam writes from two hooks', () => {
  afterEach(() => {
    hold.release();
  });

  it("keeps the first hook's write when a second writes before it commits", async () => {
    holdNavigations();
    const user = userEvent.setup();
    renderAt(
      '/p',
      <>
        <FlagButton name="a" />
        <FlagButton name="b" />
        <Suspense>
          <HoldNavigation />
        </Suspense>
      </>
    );
    await user.click(screen.getByRole('button', { name: 'a false' }));
    await user.click(screen.getByRole('button', { name: 'b false' }));

    await act(async () => hold.release());
    await waitFor(() => expect(probe()).toBe('/p?a=1&b=1|REPLACE'));
  });

  it('builds on where Back went while Back is still committing, never on the entry it left', async () => {
    const user = userEvent.setup();
    renderAt(
      '/p',
      <>
        <PushThenBack />
        <FlagButton name="b" />
        <Suspense>
          <HoldNavigation />
        </Suspense>
      </>
    );
    await user.click(screen.getByRole('button', { name: 'push a' }));
    expect(probe()).toBe('/p?a=1|PUSH');
    // Back's own navigation is the slow one: `?a=1` stays on screen.
    holdNavigations({ offShown: true });
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(probe()).toBe('/p?a=1|PUSH');
    await user.click(screen.getByRole('button', { name: 'b false' }));

    await act(async () => hold.release());
    await waitFor(() => expect(probe()).toBe('/p?b=1|REPLACE'));
  });

  it('builds on the committed URL again after Back, never on a write Back left', async () => {
    const user = userEvent.setup();
    renderAt(
      '/p',
      <>
        <PushThenBack />
        <FlagButton name="b" />
      </>
    );
    await user.click(screen.getByRole('button', { name: 'push a' }));
    expect(probe()).toBe('/p?a=1|PUSH');
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(probe()).toBe('/p|POP');
    await user.click(screen.getByRole('button', { name: 'b false' }));
    expect(probe()).toBe('/p?b=1|REPLACE');
  });
});
