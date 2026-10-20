/**
 * Settings → Notifications → "Alerts when closed" (ADR 0020): one row per
 * Character for the opt-in server-side alerts, on a screen of its own (a
 * dialog) opened from Delivery's one-line summary. The component stays
 * mounted while that screen is closed: the EVE round trip hands its outcome
 * back here, and a "Turn on for all" walk carries on from here, so neither
 * may wait for someone to open the screen. Off by default. Turning one on
 * sends the user to EVE to authorize that Character for notifications only;
 * the token goes to our server and never to this device.
 *
 * Every state is a word, never a colour alone (§6c). The row has one action,
 * so there is no ⋮ menu. "Turn on for all" walks the Characters one at a time,
 * because EVE's own page picks the Character and each needs its own round trip.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Button, Modal, NeedsConnection } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  focusRingInsetClassName,
  inlineLinkClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { beginAlertsLogin } from '@/app/loginFlow';
import {
  alertsRowState,
  type AlertsCallbackState,
  clearAlertsQueue,
  queueAlertsForAll,
  readAlertsGrants,
  takeNextQueuedAlerts,
  turnOffAlerts,
  type AlertsGrantRecord,
} from './alertsGrant';

interface CharacterRef {
  characterId: number;
  name: string;
}

type Notice = { tone: 'info' | 'warning'; text: string } | null;

export function AlertsWhenClosedSection({ characters }: { characters: readonly CharacterRef[] }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const grants: Record<number, AlertsGrantRecord> = useLiveQuery(readAlertsGrants, []) ?? {};
  const nameOf = (characterId: number) =>
    characters.find((character) => character.characterId === characterId)?.name ??
    String(characterId);

  // The Callback route hands the outcome back as router state, once. The
  // notice is read from it on arrival, not set from an effect.
  const returned = (location.state as Partial<AlertsCallbackState> | null)?.alertsGrant;
  const [notice, setNotice] = useState<Notice>(() => {
    if (!returned) return null;
    const key = (name: string) => `settings.notifications.alertsWhenClosed.result.${name}`;
    switch (returned.status) {
      case 'on':
        return { tone: 'info', text: t(key('on'), { name: returned.name }) };
      case 'mismatch':
        return {
          tone: 'warning',
          text: t(key('mismatch'), {
            authorized: returned.authorizedName,
            expected: nameOf(returned.expectedCharacterId),
          }),
        };
      case 'failed':
        return { tone: 'warning', text: t(key('failed'), { name: nameOf(returned.characterId) }) };
      default:
        return { tone: 'info', text: t(key('cancelled')) };
    }
  });
  const [busyId, setBusyId] = useState<number | null>(null);
  const isDesktop = useMediaQuery(MD_UP_QUERY);
  // Closed to start, so the list never pushes the Topics below the fold; open on
  // arrival from EVE, where it holds the outcome of the round trip.
  const [expanded, setExpanded] = useState(returned !== undefined);

  // Side effects only: drop the state so a reload does not replay it, and
  // carry on a "Turn on for all" walk after a success. Guarded, because
  // StrictMode runs this twice and a second pass would skip a queued Character.
  const handled = useRef<typeof returned>(undefined);
  useEffect(() => {
    if (!returned || handled.current === returned) return;
    handled.current = returned;
    navigate(location.pathname + location.search, { replace: true, state: null });
    if (returned.status !== 'on') {
      clearAlertsQueue();
      return;
    }
    const next = takeNextQueuedAlerts();
    if (next !== null) void beginAlertsLogin(next).catch(() => undefined);
  }, [returned, navigate, location.pathname, location.search]);

  if (characters.length === 0) return null;
  const toAuthorize = characters.filter(
    (character) => alertsRowState(grants[character.characterId]) !== 'on'
  );

  const turnOn = (characterId: number) => {
    setBusyId(characterId);
    clearAlertsQueue();
    void beginAlertsLogin(characterId).catch(() => setBusyId(null));
  };
  const turnOnAll = () => {
    const ids = toAuthorize.map((character) => character.characterId);
    queueAlertsForAll(ids);
    const first = takeNextQueuedAlerts();
    if (first !== null) {
      setBusyId(first);
      void beginAlertsLogin(first).catch(() => setBusyId(null));
    }
  };
  const turnOff = async (characterId: number) => {
    setBusyId(characterId);
    const ok = await turnOffAlerts(characterId);
    setBusyId(null);
    setNotice(
      ok
        ? null
        : {
            tone: 'warning',
            text: t('settings.notifications.alertsWhenClosed.result.offFailed', {
              name: nameOf(characterId),
            }),
          }
    );
  };

  const enabled = characters.filter(
    (character) => alertsRowState(grants[character.characterId]) === 'on'
  );
  const needsReauth = characters.filter(
    (character) => alertsRowState(grants[character.characterId]) === 'needs-reauth'
  );

  const summary = t('settings.notifications.alertsWhenClosed.summary', {
    on: enabled.length,
    total: characters.length,
  });
  const reauthNote =
    needsReauth.length > 0
      ? t('settings.notifications.alertsWhenClosed.needsReauthCount', { count: needsReauth.length })
      : null;
  const title = t('settings.notifications.alertsWhenClosed.title');

  return (
    <section aria-label={title} className="md:ml-auto">
      {isDesktop ? (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-text">
          <span>{title}:</span>
          <span className="font-mono text-[0.6875rem] text-text-dim">{summary}</span>
          {reauthNote !== null && (
            <span className="font-mono text-[0.6875rem] text-warning">{reauthNote}</span>
          )}
          <span aria-hidden="true" className="text-text-dim">
            ·
          </span>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={t('settings.notifications.alertsWhenClosed.manageFor')}
            onClick={() => setExpanded(true)}
            className={cx(inlineLinkClassName, focusRingInsetClassName)}
          >
            {t('settings.notifications.alertsWhenClosed.manage')}
          </button>
        </p>
      ) : (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setExpanded(true)}
          className={cx(
            'flex min-h-11 w-full items-center gap-3 text-left text-xs',
            interactiveClassName,
            focusRingInsetClassName
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-text">{title}</span>
            <span className="block text-[0.6875rem] text-text-dim">
              {summary}
              {reauthNote !== null && <span className="text-warning"> · {reauthNote}</span>}
            </span>
          </span>
          <Icon.GoTo size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-text-dim" />
        </button>
      )}
      <Modal
        open={expanded}
        onClose={() => setExpanded(false)}
        title={title}
        placement={isDesktop ? 'center' : 'sheet-full'}
      >
        <div className="space-y-3">
          <p className="text-[0.6875rem] text-text-dim">
            {t('settings.notifications.alertsWhenClosed.hint')}
          </p>
          {toAuthorize.length > 1 && (
            <NeedsConnection>
              <Button size="sm" onClick={turnOnAll} disabled={busyId !== null}>
                {t('settings.notifications.alertsWhenClosed.turnOnAll')}
              </Button>
            </NeedsConnection>
          )}
          {notice && (
            <p
              role="status"
              className={
                notice.tone === 'warning'
                  ? 'rounded-xs border border-warning/60 bg-warning/10 px-3 py-2 text-xs text-warning'
                  : 'rounded-xs border border-line bg-panel-2 px-3 py-2 text-xs text-text'
              }
            >
              {notice.text}
            </p>
          )}
          <ul className="divide-y divide-line rounded-xs border border-line">
            {characters.map((character) => {
              const state = alertsRowState(grants[character.characterId]);
              const busy = busyId === character.characterId;
              return (
                <li
                  key={character.characterId}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text">{character.name}</span>
                    <span className="block text-[0.6875rem] text-text-dim">
                      {t('settings.notifications.alertsWhenClosed.stores')}
                    </span>
                  </span>
                  <span
                    className={state === 'needs-reauth' ? 'text-warning' : 'text-text-dim'}
                    data-testid={`alerts-state-${character.characterId}`}
                  >
                    {t(`settings.notifications.alertsWhenClosed.state.${state}`)}
                  </span>
                  {state === 'on' ? (
                    <Button
                      size="sm"
                      loading={busy}
                      disabled={busyId !== null}
                      aria-label={t('settings.notifications.alertsWhenClosed.turnOffFor', {
                        name: character.name,
                      })}
                      onClick={() => void turnOff(character.characterId)}
                    >
                      {t('settings.notifications.alertsWhenClosed.turnOff')}
                    </Button>
                  ) : (
                    <NeedsConnection>
                      <Button
                        size="sm"
                        variant={state === 'needs-reauth' ? 'primary' : 'ghost'}
                        loading={busy}
                        disabled={busyId !== null}
                        aria-label={t(
                          state === 'needs-reauth'
                            ? 'settings.notifications.alertsWhenClosed.reauthorizeFor'
                            : 'settings.notifications.alertsWhenClosed.turnOnFor',
                          { name: character.name }
                        )}
                        onClick={() => turnOn(character.characterId)}
                      >
                        {t(
                          state === 'needs-reauth'
                            ? 'settings.notifications.alertsWhenClosed.reauthorize'
                            : 'settings.notifications.alertsWhenClosed.turnOn'
                        )}
                      </Button>
                    </NeedsConnection>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </section>
  );
}
