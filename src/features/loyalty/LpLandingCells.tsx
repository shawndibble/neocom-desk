import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableDenseCell } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { cx } from '@/lib/cx';
import type { NearestStation } from './lpStoreSnapshot';
import { tagWordClassName } from './offerRowDisplay';

export function FactionWarfareTag() {
  const { t } = useTranslation();
  return (
    <HintText content={t('loyaltyStore.landing.fwTagHelp')} className={tagWordClassName}>
      {t('loyaltyStore.landing.fwTag')}
    </HintText>
  );
}

export function NearestStationCell({
  nearest,
  systemName,
  label,
  align = 'start',
}: {
  nearest: NearestStation | null;
  systemName: (systemId: number) => string | null;
  label?: ReactNode;
  align?: 'start' | 'end';
}) {
  const { t } = useTranslation();
  const system = nearest ? (systemName(nearest.systemId) ?? `#${nearest.systemId}`) : null;
  const jumps = nearest ? t('loyaltyStore.landing.jumps', { count: nearest.jumps }) : null;
  return (
    <DataTableDenseCell>
      <span className={cx('inline-flex flex-col items-start', align === 'end' && 'sm:items-end')}>
        <span className="inline-flex items-center gap-1.5">{label ?? system}</span>
        {nearest && (
          <span className="text-[0.6875rem] text-text-dim max-sm:hidden">
            {label === undefined ? jumps : `${system} · ${jumps}`}
          </span>
        )}
      </span>
      {nearest && (
        <span className="sm:hidden">
          {t('loyaltyStore.landing.jumpsShort', { count: nearest.jumps })}
        </span>
      )}
    </DataTableDenseCell>
  );
}
