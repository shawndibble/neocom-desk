import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';

/**
 * Renders `ui` inside a `MemoryRouter` at `/`, for components that read the
 * router but don't need `<Routes>`. The router is a `wrapper`, so `rerender`
 * keeps it. A test that needs routes or an initial URL builds its own tree.
 */
export function renderInRouter(ui: ReactElement): RenderResult {
  return render(ui, { wrapper: MemoryRouter });
}
