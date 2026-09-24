/**
 * Blueprint catalog for the item context menu's Build Plan action, loaded
 * lazily on the first menu open rather than on mount — it pulls the full
 * SDE types.json, and CONTEXT.md keeps /market's own payloads out of the
 * install precache because most installs never open this page at all.
 *
 * Shared across every Market tab (Browser's tree, Open Orders, History,
 * Transactions, Appraisal all pass it to their own item context menus), so
 * it's held at route level rather than inside any one tab's panel.
 */
import { useRef, useState } from 'react';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';

/**
 * The blueprint that produces `typeId`, in the shape `ItemContextMenu`'s
 * `blueprintTypeID` wants: undefined while the catalog hasn't loaded, null once
 * it has and nothing produces the item.
 */
export function blueprintTypeIdFor(
  catalog: BlueprintCatalog | null,
  typeId: number
): number | null | undefined {
  if (catalog === null) return undefined;
  return catalog.byProductTypeID.get(typeId)?.blueprintTypeID ?? null;
}

export interface BlueprintCatalogController {
  blueprintCatalog: BlueprintCatalog | null;
  ensureBlueprintCatalog: () => void;
}

export function useBlueprintCatalog(): BlueprintCatalogController {
  const [blueprintCatalog, setBlueprintCatalog] = useState<BlueprintCatalog | null>(null);
  const requested = useRef(false);
  function ensureBlueprintCatalog() {
    if (requested.current) return;
    requested.current = true;
    void loadBlueprintCatalog()
      .then(setBlueprintCatalog)
      .catch(() => {
        // Build Plan action degrades to "No blueprint options" on failure — not core functionality.
      });
  }
  return { blueprintCatalog, ensureBlueprintCatalog };
}
