/**
 * Writes mutated items in Pyfa's EFT layout (spec: `eftFit.ts` header) for
 * both EFT exporters. Rolls sorted by internal name; a block with no known
 * rolls stops after the mutaplasmid line.
 */
import { quantiseRoll } from '@/engine/fittings/fittingShare';
import type { ItemMutation } from './types';

/** A dogma attribute's internal name (`capacitorNeed`) — `MutaplasmidLookup.attributeName`. */
export type AttributeNameFor = (attributeId: number) => string | undefined;

export interface EftMutationWriter {
  /** The name and ` [N]` suffix to write an item's line with; a mutated item's registers its block. */
  line(item: { typeId: number; mutation?: ItemMutation }): { name: string; suffix: string };
  /** Every block registered so far, as the fit's last section; null when none. */
  section(): string | null;
}

export function eftMutationWriter(
  nameFor: (typeId: number) => string,
  attributeName: AttributeNameFor = () => undefined
): EftMutationWriter {
  const blocks: string[] = [];
  return {
    line({ typeId, mutation }) {
      if (!mutation) return { name: nameFor(typeId), suffix: '' };
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
