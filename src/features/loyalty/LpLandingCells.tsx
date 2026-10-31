/** Cells the LP Store landing's two tables share (`useLpLandingColumns.tsx`). */
import { useTranslation } from 'react-i18next';
import { DataTableDenseCell } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import type { LpLandingStoreFacts } from './lpLanding';

const CAPTION = 'text-[0.6875rem] text-text-dim';

/** A word, not just a colour, for a militia store (DESIGN.md §7). */
export function FactionWarfareTag() {
  const { t } = useTranslation();
  return (
    <HintText
      content={t('loyaltyStore.landing.fwTagHelp')}
      className="shrink-0 px-1 text-[0.6875rem] font-bold tracking-widest whitespace-nowrap text-warning uppercase"
    >
      {t('loyaltyStore.landing.fwTag')}
    </HintText>
  );
}

/** "Jita · 3 jumps" on desktop; the phone card's meta line has room for "Jita 3j". */
export function Nearest({
  store,
  systemName,
  align,
}: {
  store: LpLandingStoreFacts;
  systemName: (systemId: number) => string | null;
  align: 'start' | 'end';
}) {
  const { t } = useTranslation();
  if (store.nearest === null) return null;
  const system = systemName(store.nearest.systemId) ?? `#${store.nearest.systemId}`;
  return (
    <DataTableDenseCell>
      <span className={`inline-flex flex-col items-start ${align === 'end' ? 'sm:items-end' : ''}`}>
        <span>{system}</span>
        <span className={`${CAPTION} max-sm:hidden`}>
          {t('loyaltyStore.landing.jumps', { count: store.nearest.jumps })}
        </span>
      </span>
      <span className="sm:hidden">
        {t('loyaltyStore.landing.jumpsShort', { count: store.nearest.jumps })}
      </span>
    </DataTableDenseCell>
  );
}
