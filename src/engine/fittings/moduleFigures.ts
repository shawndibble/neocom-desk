const FIGURE_ATTRIBUTE = {
  dps: -12,
  optimal: 54,
  reactivationDelay: 669,
  reloadTime: 1795,
  salvageChance: 902,
  tractorVelocity: 1045,
  cargoScanRange: 126,
  shipScanRange: 125,
} as const;

export interface ModuleFigures {
  reactivationSeconds: number;
  reloadSeconds: number;
  salvageChance: number;
  salvagerRange: number;
  tractorVelocity: number;
  tractorRange: number;
  cargoScanRange: number;
  shipScanRange: number;
}

export const NO_MODULE_FIGURES: ModuleFigures = {
  reactivationSeconds: 0,
  reloadSeconds: 0,
  salvageChance: 0,
  salvagerRange: 0,
  tractorVelocity: 0,
  tractorRange: 0,
  cargoScanRange: 0,
  shipScanRange: 0,
};

interface ItemLike {
  slot: { type: string };
}

interface ResultLike {
  attributes: { get(attributeId: number): { value: number } | undefined };
  state: string;
  charge?: unknown;
}

const MODULE_SLOTS: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

export function extractModuleFigures(
  items: readonly ItemLike[],
  results: readonly ResultLike[]
): ModuleFigures {
  const figures: ModuleFigures = { ...NO_MODULE_FIGURES };
  items.forEach((item, index) => {
    const result = results[index];
    if (!result || !MODULE_SLOTS.has(item.slot.type) || result.state === 'offline') return;
    const read = (id: number) => result.attributes.get(id)?.value ?? 0;
    figures.reactivationSeconds = Math.max(
      figures.reactivationSeconds,
      read(FIGURE_ATTRIBUTE.reactivationDelay) / 1000
    );
    if (result.charge && read(FIGURE_ATTRIBUTE.dps) <= 0)
      figures.reloadSeconds = Math.max(
        figures.reloadSeconds,
        read(FIGURE_ATTRIBUTE.reloadTime) / 1000
      );
    const salvage = read(FIGURE_ATTRIBUTE.salvageChance);
    if (salvage > 0) {
      figures.salvageChance = Math.max(figures.salvageChance, salvage);
      figures.salvagerRange = Math.max(figures.salvagerRange, read(FIGURE_ATTRIBUTE.optimal));
    }
    const tractor = read(FIGURE_ATTRIBUTE.tractorVelocity);
    if (tractor > 0) {
      figures.tractorVelocity = Math.max(figures.tractorVelocity, tractor);
      figures.tractorRange = Math.max(figures.tractorRange, read(FIGURE_ATTRIBUTE.optimal));
    }
    figures.cargoScanRange = Math.max(
      figures.cargoScanRange,
      read(FIGURE_ATTRIBUTE.cargoScanRange)
    );
    figures.shipScanRange = Math.max(figures.shipScanRange, read(FIGURE_ATTRIBUTE.shipScanRange));
  });
  return figures;
}
