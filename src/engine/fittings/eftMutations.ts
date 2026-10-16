/**
 * Writing mutated items in Pyfa's EFT layout — shared by both EFT exporters
 * (`fittingExport.ts`, `eftExport.ts`); the read half is `eftFit.ts` and
 * `eftLoader.ts`. Reconstructed from Pyfa's service/port/eft.py
 * (`exportEft`) and service/port/muta.py (`renderMutant`), not from a real
 * export sample: the fitted line names the base item and ends in ` [N]`
 * (after any charge and ` /OFFLINE`), and one block per reference closes the
 * fit — `[N] <base name>`, the mutaplasmid's name, and the rolls as
 * `attrName value, ...` by dogma internal name, alphabetically. A block
 * with no known rolls stops after the mutaplasmid, which Pyfa reads as such.
 */
import { quantiseRoll } from '@/engine/fitting/fittingShare';
import type { ItemMutation } from './types';

/** A dogma attribute's internal name (`capacitorNeed`) — `MutaplasmidLookup.attributeName`. */
export type AttributeNameFor = (attributeId: number) => string | undefined;

export interface EftMutationWriter {
  /** The name and ` [N]` suffix to write a mutated item's line with; registers its block. */
  line(mutation: ItemMutation): { name: string; suffix: string };
  /** Every block registered so far, as the fit's last section; null when none. */
  section(): string | null;
}

export function eftMutationWriter(
  nameFor: (typeId: number) => string,
  attributeName: AttributeNameFor = () => undefined
): EftMutationWriter {
  const blocks: string[] = [];
  return {
    line(mutation) {
      const ref = blocks.length + 1;
      const rolls = Object.entries(mutation.attributes)
        .flatMap(([id, value]) => {
          const name = attributeName(Number(id));
          return name === undefined ? [] : [[name, value] as const];
        })
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, value]) => `${name} ${quantiseRoll(value)}`)
        .join(', ');
      const base = nameFor(mutation.baseTypeId);
      blocks.push(
        [
          `[${ref}] ${base}`,
          `  ${nameFor(mutation.mutaplasmidTypeId)}`,
          ...(rolls ? [`  ${rolls}`] : []),
        ].join('\n')
      );
      return { name: base, suffix: ` [${ref}]` };
    },
    section: () => (blocks.length === 0 ? null : blocks.join('\n')),
  };
}
