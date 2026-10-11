/**
 * The red strip under a page header while an unacknowledged danger Alert
 * exists: a structure under attack is the one thing worth interrupting a
 * widget board for. The Overview mounts it; it draws nothing otherwise.
 *
 * Acknowledge is Dismiss for the whole danger type (the panel's rule, so the
 * strip and the panel never disagree about what is still outstanding), which
 * lets the next-newest danger type, if any, take the strip.
 */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { formatAge } from '@/lib/age';
import { useIsPhone } from '@/lib/useIsPhone';
import { useNow } from '@/lib/useNow';
import { alertGroupKey } from './alertGroups';
import { alertViewPath, isDangerEntry, selectDangerBanner } from './dangerAlert';
import { dismissFeedEntriesAndSync } from './feedSync';
import { useVisibleAlertEntries } from './useUnreadAlertCount';

export function DangerBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const now = useNow();
  const entries = useVisibleAlertEntries();
  const entry = selectDangerBanner(entries);
  if (entry === null) return null;

  const key = alertGroupKey(entry);
  const size = phone ? 'md' : 'sm';
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xs border border-danger bg-danger/10 px-3 py-2"
    >
      <span className="text-[0.6875rem] font-semibold tracking-widest text-danger uppercase">
        {t('alerts.panel.danger')}
      </span>
      <b className="text-sm">{entry.title}</b>
      <span className="min-w-0 text-xs text-text-dim">
        {entry.body} · {formatAge(Math.max(0, now - entry.firedAt), t)}
      </span>
      <span className="ml-auto flex gap-1.5">
        <Button
          size={size}
          variant="primary"
          aria-label={t('alerts.panel.viewLabel', { title: entry.title })}
          onClick={() => navigate(alertViewPath(key))}
        >
          {t('alerts.panel.view')}
        </Button>
        <Button
          size={size}
          aria-label={t('alerts.panel.acknowledgeLabel', { title: entry.title })}
          onClick={() =>
            void dismissFeedEntriesAndSync(
              entries.filter((row) => isDangerEntry(row) && alertGroupKey(row) === key)
            )
          }
        >
          {t('alerts.panel.acknowledge')}
        </Button>
      </span>
    </div>
  );
}
