import { quantiseRoll } from '@/engine/fittings/fittingShare';
import type { ItemMutation } from './types';

export type AttributeNameFor = (attributeId: number) => string | undefined;

export interface EftMutationWriter {
  line(item: { typeId: number; mutation?: ItemMutation }): { name: string; suffix: string };
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
