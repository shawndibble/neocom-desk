/**
 * The red strip under a page header while an unacknowledged danger Alert
 * exists: a structure under attack is the one thing worth interrupting a
 * widget board for. The Overview mounts it; it draws nothing otherwise.
 *
 * Acknowledge is Dismiss for the whole danger type (the panel's rule, so the
 * strip and the panel never disagree about what is still outstanding), which
 * lets the next-newest danger type, if any, take the strip.
 *
 * Acknowledge unmounts the button that ran it, so focus is moved to the page
 * heading once the strip is gone (WCAG 2.4.3). The strip is an alert only the
 * first time this session shows a given danger entry; coming back to the
 * Overview later renders it as a plain status so a screen reader is not told
 * the same news again on every mount.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { formatAge } from '@/lib/age';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useIsPhone } from '@/lib/useIsPhone';
import { useNow } from '@/lib/useNow';
import { alertGroupKey } from './alertGroups';
import { alertViewPath, isDangerEntry, selectDangerBanner } from './dangerAlert';
import { dismissFeedEntriesAndSync } from './feedSync';
import { isDismissOnView, useNotificationPreferences } from './preferences';
import { useVisibleAlertEntries } from './useUnreadAlertCount';

/** Which banner instance announced each danger entry this session (module-level: it outlives a route change). */
const announcedBy = new Map<string, symbol>();

export function DangerBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const now = useNow();
  const entries = useVisibleAlertEntries();
  const dismissOnView = useNotificationPreferences((state) => isDismissOnView(state.value));
  const entry = selectDangerBanner(entries);
  const focusAfterCommit = useFocusAfterCommit();
  const entryId = entry?.id;
  const [self] = useState(() => Symbol('DangerBanner'));
  // An entry is an alert only for the instance that first showed it; a later mount sees a status.
  const fresh = entryId !== undefined && (announcedBy.get(entryId) ?? self) === self;
  useEffect(() => {
    if (entryId !== undefined && !announcedBy.has(entryId)) announcedBy.set(entryId, self);
  }, [entryId, self]);
  if (entry === null) return null;

  const key = alertGroupKey(entry);
  const size = phone ? 'md' : 'sm';
  const dangerEntries = entries.filter((row) => isDangerEntry(row) && alertGroupKey(row) === key);
  return (
    <div
      role={fresh ? 'alert' : 'status'}
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
          onClick={() => {
            if (dismissOnView) void dismissFeedEntriesAndSync(dangerEntries);
            navigate(alertViewPath(key));
          }}
        >
          {t('alerts.panel.view')}
        </Button>
        <Button
          size={size}
          aria-label={t('alerts.panel.acknowledgeLabel', { title: entry.title })}
          onClick={() => {
            // The strip may hand over to the next danger type (button stays) or vanish (heading).
            focusAfterCommit(() => document.querySelector<HTMLElement>('h1'));
            void dismissFeedEntriesAndSync(dangerEntries);
          }}
        >
          {t('alerts.panel.acknowledge')}
        </Button>
      </span>
    </div>
  );
}
