import type { PiData } from '@/sde/types';
import { commodityName } from '../goalPlannerFormat';
import { PiProductList } from '../PiProductLink';
import { Sentence } from '../sentence';

/**
 * A translated sentence whose product names are links to their PI detail
 * (DESIGN.md §6c "Entities", PI override). The caller passes
 * `t(key, { p0: '{p0}', … })` so i18next resolves everything else, and the
 * type id behind each token here; a list of ids reads comma-separated.
 */
export function ProductSentence({
  text,
  products,
  pi,
}: {
  text: string;
  products: Readonly<Record<string, number | readonly number[]>>;
  pi: PiData;
}) {
  const slots = Object.fromEntries(
    Object.entries(products).map(([token, ids]) => [
      token,
      <PiProductList
        key={token}
        items={(typeof ids === 'number' ? [ids] : ids).map((typeId) => ({
          typeId,
          name: commodityName(typeId, pi),
        }))}
      />,
    ])
  );
  return <Sentence text={text} slots={slots} />;
}
