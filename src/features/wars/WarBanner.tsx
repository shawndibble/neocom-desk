/**
 * The red strip under a page header while the Character's corporation (or its
 * alliance) has a war declared on it, still running or about to start. It
 * draws nothing otherwise. The Overview and the Corp overview mount it;
 * "Details" opens the war's card in a modal.
 *
 * Not the Danger banner: that one is driven by Alerts and acknowledged away,
 * while a war is a standing condition that ends when the war does, so there is
 * nothing to acknowledge. It is a plain status, not an alert: the war is not a
 * new event on every visit.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { formatCountdown } from '@/lib/duration';
import { formatAge } from '@/lib/age';
import { useIsPhone } from '@/lib/useIsPhone';
import { useNow } from '@/lib/useNow';
import { usePartyName } from './usePartyName';
import { useWarsAgainstMe } from './useWarsAgainstMe';
import { WarModal } from './WarModal';

export function WarBanner({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const now = useNow();
  const wars = useWarsAgainstMe(characterId);
  const [open, setOpen] = useState(false);
  const first = wars[0];
  // Hooks above run for every render; the name hook needs a party even with no war.
  const name = usePartyName(first?.war.aggressor ?? {});
  if (first === undefined) return null;

  const more = wars.length - 1;
  const when =
    first.status.kind === 'pending'
      ? first.status.startsIn === null
        ? t('wars.banner.notStarted')
        : t('wars.banner.startsIn', { time: formatCountdown(first.status.startsIn / 1000) })
      : t('wars.banner.declared', { age: formatAge(Math.max(0, now - first.war.declared), t) });

  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xs border border-danger bg-danger/10 px-3 py-2"
      >
        <span className="text-[0.6875rem] font-semibold tracking-widest text-danger uppercase">
          {t('wars.banner.label')}
        </span>
        <b className="min-w-0 text-sm">
          {more > 0
            ? t('wars.banner.titleMore', { name, count: more })
            : t('wars.banner.title', { name })}
        </b>
        <span className="min-w-0 text-xs text-text-dim">{when}</span>
        <span className="ml-auto">
          <Button
            size={phone ? 'md' : 'sm'}
            variant="primary"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            {t('wars.banner.view')}
          </Button>
        </span>
      </div>
      <WarModal open={open} onClose={() => setOpen(false)} wars={wars} />
    </>
  );
}
