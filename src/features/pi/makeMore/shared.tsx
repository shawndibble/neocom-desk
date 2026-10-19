/** Pieces the "Make more from my planets" panels share. */
import { useTranslation } from 'react-i18next';
import { PiProductLink } from '../PiProductLink';
import type { NamedItem } from '../planView';

/** The shared tick state: ids of ticked rows and a toggle. */
export interface Ticks {
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}

export function ItemLink({ item }: { item: NamedItem }) {
  return (
    <PiProductLink typeId={item.typeId}>
      <b className="font-semibold">{item.name}</b>
    </PiProductLink>
  );
}

export function ItemList({ items }: { items: readonly NamedItem[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={item.typeId}>
          {i > 0 && ', '}
          <ItemLink item={item} />
        </span>
      ))}
    </>
  );
}

export function Minutes({ value }: { value: number }) {
  const { t } = useTranslation();
  return (
    <span className="shrink-0 text-[0.6875rem] text-text-dim tabular-nums">
      {t('piPlan.make.minutes', { count: value })}
    </span>
  );
}
