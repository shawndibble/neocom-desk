import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { buildPlanAdvice, type PlanAdvice } from '@/features/pi/planAdviceModel';
import { adviceInput, pi } from '@/features/pi/map/mapFixtures.testutil';
import { buildMapGraph } from '@/features/pi/map/mapModel';
import { PlanMap, type PlanMapProps } from '@/features/pi/map/PlanMap';

// Shared harness for the PlanMap tests (src/features/pi/map/PlanMap*.test.tsx), one
// file per concern so CI runs them in parallel. Each file keeps its own `vi.mock`
// calls (vitest hoists them per file) and calls installPlanMapHarness() once.

export const graph = buildMapGraph(pi);
export let advice: PlanAdvice;
export let adviceNone: PlanAdvice;

export const withWhatIf = (kind: 'lean' | 'none') => (types: ReadonlySet<PlanetType>) =>
  buildPlanAdvice(adviceInput(kind, { whatIfTypes: [...types] }));

export function props(overrides: Partial<PlanMapProps> = {}): PlanMapProps {
  return {
    graph,
    advice,
    adviceWithWhatIf: withWhatIf('lean'),
    colonies: [{ planetId: 40000001, type: 'temperate', name: 'Hek VIII' }],
    finder: { systemId: 30000142, name: 'Jita', security: 0.9 },
    ...overrides,
  };
}

export function renderMap(overrides: Partial<PlanMapProps> = {}, entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PlanMap {...props(overrides)} />
    </MemoryRouter>
  );
}

/** Resize observers the component created, so a test can report a width the way a browser would. */
const observers: { cb: ResizeObserverCallback; el: Element }[] = [];
export function observedElements(): Element[] {
  return observers.map((o) => o.el);
}
export function reportWidth(width: number) {
  act(() => {
    for (const { cb, el } of observers) {
      cb([{ target: el, contentRect: { width } } as unknown as ResizeObserverEntry], {} as never);
    }
  });
}

export function stubPhone(phone: boolean) {
  window.matchMedia = ((media: string) =>
    ({
      media,
      matches: phone && media.includes('max-width'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

// A product tile is a link to its PI detail (`?product=`), not a button.
export const product = (name: string) =>
  screen.getByRole('link', { name: new RegExp(`^${name}\\. `) });
export const maybeProduct = (name: string) =>
  screen.queryByRole('link', { name: new RegExp(`^${name}\\. `) });
export const planet = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name} planet`) });

export function graphName(typeId: number): string {
  return graph.byId.get(typeId)!.name;
}

/** Registers the advice build and the per-test browser stubs. Call once at module scope. */
export function installPlanMapHarness(): void {
  beforeAll(() => {
    advice = buildPlanAdvice(adviceInput('lean'));
    adviceNone = buildPlanAdvice(adviceInput('none'));
  });
  beforeEach(() => {
    localStorage.clear();
    observers.length = 0;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private cb: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.cb = cb;
        }
        observe(el: Element) {
          observers.push({ cb: this.cb, el });
        }
        unobserve() {}
        disconnect() {}
      }
    );
    stubPhone(false);
  });
  afterEach(() => vi.unstubAllGlobals());
}
