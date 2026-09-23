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
import { definePageTabs } from '@/lib/pageTabs';
import { usePageTab } from '@/lib/usePageTab';
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
  return (
    <output data-testid="probe">
      {location.pathname}
      {location.search}
      {location.hash}|{navigationType}
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
    expect(probe()).toBe('/page/one?highlight=5#x|REPLACE');
    expect(screen.getByTestId('tab')).toHaveTextContent('one');
  });

  it('replaces an unknown tab segment with the default tab', () => {
    renderAt('/page/nope');
    expect(probe()).toBe('/page/one|REPLACE');
  });

  it('renders a declared tab as is', () => {
    renderAt('/page/two');
    expect(probe()).toBe('/page/two|POP');
    expect(screen.getByTestId('tab')).toHaveTextContent('two');
  });
});

describe('usePageTab', () => {
  it('pushes a tab switch, carrying the query string, and Back returns to the previous tab', async () => {
    const user = userEvent.setup();
    renderAt('/page/one?q=abc');
    await user.click(screen.getByRole('button', { name: 'two' }));
    expect(probe()).toBe('/page/two?q=abc|PUSH');
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(probe()).toBe('/page/one?q=abc|POP');
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
    expect(probe()).toBe('/page/two?q=hi|REPLACE');
    expect(screen.getByLabelText('q')).toHaveValue('hi');
  });
});
