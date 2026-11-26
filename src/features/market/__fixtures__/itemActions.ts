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

export function withItemActions(ui: ReactNode, actions: ItemActions = fakeItemActions()) {
  return createElement(FakeItemActions, { actions, children: ui });
}
