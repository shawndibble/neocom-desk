import type { PiData } from '@/sde/types';
import { commodityName } from '../goalPlannerFormat';
import { PiProductList } from '../PiProductLink';
import { Sentence } from '../sentence';

export type ProductSlots = Readonly<Record<string, number | readonly number[]>>;

export function ProductSentence({
  text,
  products,
  pi,
}: {
  text: string;
  products: ProductSlots;
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
