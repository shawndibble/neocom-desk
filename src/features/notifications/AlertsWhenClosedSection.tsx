import { useEffect, useMemo, useRef, useState } from 'react';
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
  queueAlertsWalk,
  readAlertsGrants,
  takeNextQueuedAlerts,
  turnOffAlerts,
  useAlertsMail,
  useAlertsNearby,
  type AlertsGrantRecord,
} from './alertsGrant';
import {
  alertsNeeds,
  planAlertsWalk,
  nagsForSignIn,
  summarizeAlertsNeeds,
  type AlertsPermission,
  type AlertsWalkStep,
} from './alertsNeeds';
import { AlertsSignInConfirm } from './AlertsSignInConfirm';
import { useNotificationPreferences } from './preferencesStore';
import { QuietTimeRows } from './QuietTimeRows';
import { DividedList } from '@/components/ui/DividedList';
import { LiveNote } from '@/components/ui/LiveStatus';
import { useGrantedScopesByCharacter } from '@/app/grantedScopes';

interface CharacterRef {
  characterId: number;
  name: string;
}

const NO_SCOPES: ReadonlyMap<number, ReadonlySet<string>> = new Map();
const NO_GRANTS: Record<number, AlertsGrantRecord> = {};

type Notice = { tone: 'info' | 'warning'; text: string } | null;

const signInStep = (step: AlertsWalkStep) =>
  beginAlertsLogin(step.characterId, { nearby: step.nearby, mail: step.mail });

export function AlertsWhenClosedSection({ characters }: { characters: readonly CharacterRef[] }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const grants: Record<number, AlertsGrantRecord> = useLiveQuery(readAlertsGrants, []) ?? NO_GRANTS;
  const nearby = useAlertsNearby();
  const mail = useAlertsMail();
  const prefs = useNotificationPreferences((state) => state.value);
  const deviceScopes = useGrantedScopesByCharacter();
  const needs = useMemo(
    () =>
      alertsNeeds({
        characters,
        prefs,
        grants,
        nearby,
        mail,
        deviceScopes: deviceScopes ?? NO_SCOPES,
      }),
    [characters, prefs, grants, nearby, mail, deviceScopes]
  );
  const needOf = (characterId: number) => needs.find((need) => need.characterId === characterId);
  const permissionLabel = (permission: AlertsPermission) =>
    t(`settings.notifications.alertsWhenClosed.need.${permission}`);
  const list = (items: string[]) =>
    new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(items);
  const covers = (characterId: number) =>
    t('settings.notifications.alertsWhenClosed.covers.line', {
      list: list(
        (needOf(characterId)?.held ?? []).map((permission) =>
          t(`settings.notifications.alertsWhenClosed.covers.${permission}`)
        )
      ),
    });
  const nameOf = (characterId: number) =>
    characters.find((character) => character.characterId === characterId)?.name ??
    String(characterId);

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
  const [confirming, setConfirming] = useState<number[] | null>(null);
  const isDesktop = useMediaQuery(MD_UP_QUERY);
  const [expanded, setExpanded] = useState(returned !== undefined);

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
    if (next !== null) void signInStep(next).catch(() => undefined);
  }, [returned, navigate, location.pathname, location.search]);

  if (characters.length === 0) return null;
  const walking = needs.filter(nagsForSignIn);
  const summaryNeeds = summarizeAlertsNeeds(needs);

  const startWalk = (
    characterIds: readonly number[],
    include: { location: boolean; mail: boolean }
  ) => {
    const steps = planAlertsWalk(
      needs.filter((need) => characterIds.includes(need.characterId)),
      include
    );
    const [first, ...rest] = steps;
    if (first === undefined) return;
    queueAlertsWalk(rest);
    setBusyId(first.characterId);
    void signInStep(first).catch(() => setBusyId(null));
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

  const summary = t('settings.notifications.alertsWhenClosed.summary', {
    on: enabled.length,
    total: characters.length,
  });
  const reauthNote =
    walking.length > 0
      ? t('settings.notifications.alertsWhenClosed.needsSignInCount', { count: walking.length })
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
            className={cx(inlineLinkClassName, focusRingInsetClassName, 'touch:min-h-9')}
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
            'flex min-h-9 w-full items-center gap-3 text-left text-xs',
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
        onClose={() => {
          setExpanded(false);
          setConfirming(null);
        }}
        title={title}
        placement={isDesktop ? 'center' : 'sheet-full'}
      >
        {confirming !== null ? (
          <AlertsSignInConfirm
            needs={needs.filter((need) => need.needsWalk && confirming.includes(need.characterId))}
            names={new Map(characters.map((character) => [character.characterId, character.name]))}
            busy={busyId !== null}
            onCancel={() => setConfirming(null)}
            onContinue={(include) => startWalk(confirming, include)}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-[0.6875rem] text-text-dim">
              {t('settings.notifications.alertsWhenClosed.hint')}
            </p>
            <QuietTimeRows />
            {(summaryNeeds.characters > 0 || enabled.length > 0) && (
              <p className="text-xs text-text">
                {summaryNeeds.characters === 0
                  ? t('settings.notifications.alertsWhenClosed.needsNone')
                  : t('settings.notifications.alertsWhenClosed.needsLine', {
                      count: summaryNeeds.characters,
                      list: list(summaryNeeds.permissions.map(permissionLabel)),
                    })}
              </p>
            )}
            {summaryNeeds.characters > 0 && (
              <NeedsConnection>
                <Button
                  size="sm"
                  onClick={() => setConfirming(walking.map((need) => need.characterId))}
                  aria-disabled={busyId !== null || undefined}
                >
                  {t('settings.notifications.alertsWhenClosed.signInAll', {
                    count: summaryNeeds.characters,
                  })}
                </Button>
              </NeedsConnection>
            )}
            {notice && (
              <LiveNote
                className={
                  notice.tone === 'warning'
                    ? 'rounded-xs border border-warning/60 bg-warning/10 px-3 py-2 text-xs text-warning'
                    : 'rounded-xs border border-line bg-panel-2 px-3 py-2 text-xs text-text'
                }
              >
                {notice.text}
              </LiveNote>
            )}
            <DividedList surface="none" as="ul">
              {characters.map((character) => {
                const state = alertsRowState(grants[character.characterId]);
                const need = needOf(character.characterId);
                const busy = busyId === character.characterId;
                const missingNote =
                  state === 'on' && need?.needsWalk
                    ? t('settings.notifications.alertsWhenClosed.rowNeeds', {
                        list: list(need.missing.map(permissionLabel)),
                      })
                    : null;
                const stateKey = state === 'on' && need?.needsWalk ? 'onNeedsSignIn' : state;
                return (
                  <li
                    key={character.characterId}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-text">{character.name}</span>
                      <span className="block text-[0.6875rem] text-text-dim">
                        {state === 'off'
                          ? t(
                              need?.needsWalk
                                ? 'settings.notifications.alertsWhenClosed.offNeeds'
                                : 'settings.notifications.alertsWhenClosed.offNothing',
                              { list: list((need?.wanted ?? []).map(permissionLabel)) }
                            )
                          : covers(character.characterId)}
                      </span>
                      {missingNote !== null && (
                        <span className="block text-[0.6875rem] text-warning">{missingNote}</span>
                      )}
                    </span>
                    <span
                      className={state === 'needs-reauth' ? 'text-warning' : 'text-text-dim'}
                      data-testid={`alerts-state-${character.characterId}`}
                    >
                      {t(`settings.notifications.alertsWhenClosed.state.${stateKey}`)}
                    </span>
                    {need?.needsWalk && (
                      <NeedsConnection>
                        <Button
                          size="sm"
                          variant={state === 'needs-reauth' ? 'primary' : 'ghost'}
                          loading={busy}
                          aria-disabled={busyId !== null || undefined}
                          aria-label={t(
                            state === 'needs-reauth'
                              ? 'settings.notifications.alertsWhenClosed.reauthorizeFor'
                              : 'settings.notifications.alertsWhenClosed.signInFor',
                            { name: character.name }
                          )}
                          onClick={() => setConfirming([character.characterId])}
                        >
                          {t(
                            state === 'needs-reauth'
                              ? 'settings.notifications.alertsWhenClosed.reauthorize'
                              : 'settings.notifications.alertsWhenClosed.signIn'
                          )}
                        </Button>
                      </NeedsConnection>
                    )}
                    {state === 'on' && (
                      <Button
                        size="sm"
                        loading={busy && !need?.needsWalk}
                        aria-disabled={busyId !== null || undefined}
                        aria-label={t('settings.notifications.alertsWhenClosed.turnOffFor', {
                          name: character.name,
                        })}
                        onClick={() => void turnOff(character.characterId)}
                      >
                        {t('settings.notifications.alertsWhenClosed.turnOff')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </DividedList>
          </div>
        )}
      </Modal>
    </section>
  );
}
