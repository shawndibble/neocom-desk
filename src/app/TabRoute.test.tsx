import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { definePageTabs, type TabRouteDefaultState } from '@/lib/pageTabs';
import { usePageTab, useRememberedPageTab, type RememberedTab } from '@/lib/usePageTab';
import { useUrlParam } from '@/lib/useUrlState';
import { textParam } from '@/lib/urlState';
import { TabRoute } from './TabRoute';

const PAGE = definePageTabs('/page', [
  { id: 'one', labelKey: 'one' },
  { id: 'two', labelKey: 'two' },
]);
const Q = textParam();

function Page() {
  const [tab, setTab] = usePageTab(PAGE);
  const [q, setQ] = useUrlParam('q', Q);
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="tab">{tab}</span>
      {PAGE.tabs.map((item) => (
        <button key={item.id} type="button" onClick={() => setTab(item.id)}>
          {item.id}
        </button>
      ))}
      <input aria-label="q" value={q} onChange={(event) => setQ(event.target.value)} />
      <button type="button" onClick={() => navigate(-1)}>
        back
      </button>
    </div>
  );
}

function Probe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const defaulted = (location.state as TabRouteDefaultState | null)?.tabRouteDefaulted ?? false;
  return (
    <output data-testid="probe">
      {location.pathname}
      {location.search}
      {location.hash}|{navigationType}|{String(defaulted)}
    </output>
  );
}

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={['/elsewhere', initial]} initialIndex={1}>
      <Routes>
        <Route
          path="/page/*"
          element={
            <TabRoute page={PAGE}>
              <Page />
            </TabRoute>
          }
        />
        <Route path="*" element={<span>elsewhere</span>} />
      </Routes>
      <Probe />
    </MemoryRouter>
  );
}

const probe = () => screen.getByTestId('probe').textContent;

afterEach(() => {
  vi.useRealTimers();
});

describe('TabRoute', () => {
  it('replaces the bare page path with the default tab, keeping query and hash', () => {
    renderAt('/page?highlight=5#x');
    expect(probe()).toBe('/page/one?highlight=5#x|REPLACE|true');
    expect(screen.getByTestId('tab')).toHaveTextContent('one');
  });

  it('replaces an unknown tab segment with the default tab', () => {
    renderAt('/page/nope');
    expect(probe()).toBe('/page/one|REPLACE|true');
  });

  it('renders a declared tab as is', () => {
    renderAt('/page/two');
    expect(probe()).toBe('/page/two|POP|false');
    expect(screen.getByTestId('tab')).toHaveTextContent('two');
  });
});

describe('usePageTab', () => {
  it('pushes a tab switch, carrying the query string, and Back returns to the previous tab', async () => {
    const user = userEvent.setup();
    renderAt('/page/one?q=abc');
    await user.click(screen.getByRole('button', { name: 'two' }));
    expect(probe()).toBe('/page/two?q=abc|PUSH|false');
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(probe()).toBe('/page/one?q=abc|POP|false');
    expect(screen.getByTestId('tab')).toHaveTextContent('one');
  });

  it('lands text typed just before a tab switch on the new tab, not the old one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('/page/one');
    await user.type(screen.getByLabelText('q'), 'hi');
    await user.click(screen.getByRole('button', { name: 'two' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(probe()).toBe('/page/two?q=hi|REPLACE|false');
    expect(screen.getByLabelText('q')).toHaveValue('hi');
  });
});

describe('TabRoute with an index state', () => {
  const INDEXED = definePageTabs(
    '/idx',
    [
      { id: 'one', labelKey: 'one' },
      { id: 'two', labelKey: 'two' },
    ],
    undefined,
    { hiddenFrom: '(min-width: 48rem)' }
  );

  function renderIndexed(wide: boolean) {
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      matches: wide,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    return render(
      <MemoryRouter initialEntries={['/idx']}>
        <Routes>
          <Route
            path="/idx/*"
            element={
              <TabRoute page={INDEXED}>
                <span>content</span>
              </TabRoute>
            }
          />
        </Routes>
        <Probe />
      </MemoryRouter>
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it('keeps the bare path below the breakpoint', () => {
    renderIndexed(false);
    expect(probe()).toBe('/idx|POP|false');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('still redirects to the default tab from the breakpoint up', () => {
    renderIndexed(true);
    expect(probe()).toBe('/idx/one|REPLACE|true');
  });
});

describe('useRememberedPageTab', () => {
  function RememberedPage({ remembered }: { remembered: RememberedTab<'one' | 'two'> }) {
    const [tab] = useRememberedPageTab(PAGE, remembered);
    const navigate = useNavigate();
    return (
      <div>
        <span data-testid="tab">{tab}</span>
        <button type="button" onClick={() => navigate(-1)}>
          back
        </button>
      </div>
    );
  }

  function renderRemembered(initial: string, remembered: RememberedTab<'one' | 'two'>) {
    const tree = (next: RememberedTab<'one' | 'two'>) => (
      <MemoryRouter initialEntries={['/elsewhere', initial]} initialIndex={1}>
        <Routes>
          <Route
            path="/page/*"
            element={
              <TabRoute page={PAGE}>
                <RememberedPage remembered={next} />
              </TabRoute>
            }
          />
          <Route path="*" element={<span>elsewhere</span>} />
        </Routes>
        <Probe />
      </MemoryRouter>
    );
    const view = render(tree(remembered));
    return { rerender: (next: RememberedTab<'one' | 'two'>) => view.rerender(tree(next)) };
  }

  it('swaps a bare visit for the remembered tab by replace, keeping query and hash', async () => {
    const user = userEvent.setup();
    renderRemembered('/page?q=abc#x', { value: 'two', hydrated: true });
    expect(probe()).toBe('/page/two?q=abc#x|REPLACE|false');
    expect(screen.getByTestId('tab')).toHaveTextContent('two');

    // No phantom default-tab entry behind it for Back to bounce off.
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByText('elsewhere')).toBeInTheDocument();
  });

  it('never overrides a link that names the default tab itself', () => {
    renderRemembered('/page/one', { value: 'two', hydrated: true });
    expect(probe()).toBe('/page/one|POP|false');
  });

  it('stays on the default tab when that is the remembered one', () => {
    renderRemembered('/page', { value: 'one', hydrated: true });
    expect(probe()).toBe('/page/one|REPLACE|true');
  });

  it('waits for the store to hydrate, then decides once', () => {
    const { rerender } = renderRemembered('/page', { value: 'one', hydrated: false });
    expect(probe()).toBe('/page/one|REPLACE|true');

    rerender({ value: 'one', hydrated: true });
    rerender({ value: 'two', hydrated: true });

    // Decided at hydration: a later change to the stored value is an edit, not a landing.
    expect(probe()).toBe('/page/one|REPLACE|true');
  });

  it('applies a remembered tab that arrives with hydration', () => {
    const { rerender } = renderRemembered('/page', { value: 'one', hydrated: false });
    rerender({ value: 'two', hydrated: true });
    expect(probe()).toBe('/page/two|REPLACE|false');
  });
});
