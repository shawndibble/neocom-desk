/**
 * The module-by-module figures a swap can move that no other stat names: a
 * reactivation or reload delay, a salvager's and a tractor's reach, a
 * scanner's range. Read off the engine's final per-item attributes, the way
 * `explore.ts` does; display only (never a ranking metric). Pure.
 *
 * Attribute ids are plain SDE, named by `market/attributes.json`: 669 Reactivation
 * Delay and 1795 Reload Time (ms), 902 Access Difficulty Bonus (a salvager's
 * %), 54 Optimal Range (m), 1045 Maximum Tractor Velocity, 126 Cargoscan range
 * and 125 Ship scanning range (m). A weapon's DPS is the patched derived
 * attribute -12: a module that has one is a weapon, whose reload already
 * shapes sustained DPS.
 */

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
  /** The longest reactivation delay, seconds; 0 with none. */
  reactivationSeconds: number;
  /** The longest reload of a loaded non-weapon (ancillary repairer), seconds; 0 with none. */
  reloadSeconds: number;
  /** The best salvager's chance bonus, % ; its optimal range, metres. */
  salvageChance: number;
  salvagerRange: number;
  /** The fastest tractor beam's velocity, m/s; its range, metres. */
  tractorVelocity: number;
  tractorRange: number;
  /** The longest scanners, metres. */
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

/** `items`/`results` are the index-parallel `dogmaFit.items` and `calculation.items`. */
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
    // A loaded non-weapon: an ancillary repairer's reload; a weapon's already shapes sustained DPS.
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
