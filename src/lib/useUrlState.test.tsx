import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { boolParam, enumSetParam, textParam } from './urlState';
import { useUrlFilter, useUrlParam, useUrlParams, useUrlSort } from './useUrlState';

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
});
