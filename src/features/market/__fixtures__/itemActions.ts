/**
 * Test-only Item Actions: every action a mock, the Quickbar available, and no
 * catalog (Build Plan "checking…") unless `blueprints` is given — so a panel
 * test wraps its render once and asserts on the spies it cares about. A `.ts`
 * file (`createElement`, no JSX) so Fast Refresh's component-only-exports
 * rule doesn't apply to a test helper.
 */
import { createElement, type ReactNode } from 'react';
import { vi } from 'vitest';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { blueprintTypeIdFor, ItemActionsContext, type ItemActions } from '../itemActions';

export function fakeItemActions(overrides: Partial<ItemActions> = {}): ItemActions {
  const blueprints: BlueprintCatalog | null = overrides.blueprints ?? null;
  return {
    canAddToQuickbar: true,
    addToQuickbar: vi.fn(),
    showInfo: vi.fn(),
    blueprints,
    blueprintFor: (typeId) => blueprintTypeIdFor(blueprints, typeId),
    requestBlueprints: vi.fn(),
    ...overrides,
  };
}

export function FakeItemActions({
  actions = fakeItemActions(),
  children,
}: {
  actions?: ItemActions;
  children: ReactNode;
}) {
  return createElement(ItemActionsContext.Provider, { value: actions }, children);
}

/** `ui` under `actions` (a fresh `fakeItemActions()` by default) — for `render(withItemActions(<Panel />))`. */
export function withItemActions(ui: ReactNode, actions: ItemActions = fakeItemActions()) {
  return createElement(ItemActionsContext.Provider, { value: actions }, ui);
}
