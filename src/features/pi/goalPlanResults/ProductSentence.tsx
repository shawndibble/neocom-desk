import type { PiData } from '@/sde/types';
import { commodityName } from '../goalPlannerFormat';
import { PiProductLink } from '../PiProductLink';
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
      (typeof ids === 'number' ? [ids] : ids).map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <PiProductLink typeId={id}>{commodityName(id, pi)}</PiProductLink>
        </span>
      )),
    ])
  );
  return <Sentence text={text} slots={slots} />;
}
