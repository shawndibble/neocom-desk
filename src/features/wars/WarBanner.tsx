import { LiveStatus } from '@/components/ui/LiveStatus';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  interactiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { formatAge } from '@/lib/age';
import { useNow } from '@/lib/useNow';
import { usePartyName } from './usePartyName';
import { useWarsAgainstMe } from './useWarsAgainstMe';
import { groupWarsByCorporation } from './warGroups';
import { WarModal } from './WarModal';

export function WarBanner({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const now = useNow();
  const { wars, corporations: accountCorporations } = useWarsAgainstMe(characterId);
  const [open, setOpen] = useState(false);
  const first = wars[0];
  const name = usePartyName(first?.war.aggressor ?? {});
  if (first === undefined) return null;

  const corporations = groupWarsByCorporation(wars).length;
  const more = wars.length - 1;
  const title =
    corporations > 1
      ? t('wars.banner.corporations', { count: corporations })
      : more > 0
        ? t('wars.banner.titleMore', { name, count: more })
        : t('wars.banner.title', { name });
  const when =
    corporations > 1
      ? null
      : first.status.kind === 'pending'
        ? first.status.startsIn === null
          ? t('wars.banner.notStarted')
          : t('wars.banner.startsIn', { time: formatCountdown(first.status.startsIn / 1000) })
        : t('wars.banner.declared', { age: formatAge(Math.max(0, now - first.war.declared), t) });

  return (
    <>
      <div>
        <LiveStatus>{title}</LiveStatus>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className={cx(
            'flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xs border border-danger bg-danger/10 px-3 py-2 text-left hover:bg-danger/15',
            tappableRowClassName,
            interactiveClassName,
            focusRingClassName
          )}
        >
          <span className="text-[0.6875rem] font-semibold tracking-widest text-danger uppercase">
            {t('wars.banner.label')}
          </span>
          <b className="min-w-0 text-sm">{title}</b>
          {when !== null && <span className="min-w-0 text-xs text-text-dim">{when}</span>}
          <Icon.GoTo aria-hidden="true" className="ml-auto shrink-0 text-text-dim" />
        </button>
      </div>
      <WarModal
        open={open}
        onClose={() => setOpen(false)}
        wars={wars}
        nameCorporation={accountCorporations > 1}
      />
    </>
  );
}
