import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection } from '@/components/ui';
import { beginCorpSyncLogin } from '@/app/loginFlow';
import { formatAge } from '@/lib/age';
import type { ScheduledSyncRun } from '@/engine/corpTaxBook/scheduledSync';
import { turnOffScheduledSync, type CorpSyncCallbackState } from '../taxBook/syncGrant';
import { useCharacterNames } from '@/features/character/useCharacters';
import { useBook } from './useBook';

type Notice = { tone: 'info' | 'warning'; text: string } | null;

/**
 * The book's "Automatic sync" (ADR 0025, issue #4068): who holds the scheduled
 * sync, when it last ran, and the opt-in and revoke controls. Any book
 * editor can turn it on for their own Character (one holder per corporation, so
 * a new opt-in replaces the old); the holder can turn it off, and so can the CEO
 * for anyone. Turning it on sends the user to EVE to authorize the narrow scopes;
 * the token goes to our server and never to this device. Every state is a word.
 */
export function AutomaticSyncSection() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { characterId, corporationId, data, verdict, canEdit, names, reload } = useBook();
  const localNames = useCharacterNames();
  const scheduled = data.scheduledSync ?? null;
  const [busy, setBusy] = useState(false);

  // The Callback route hands the outcome back as router state, once. The notice is
  // read from it on arrival, not set from an effect.
  const returned = (location.state as Partial<CorpSyncCallbackState> | null)?.corpSyncGrant;
  const [notice, setNotice] = useState<Notice>(() => {
    if (!returned) return null;
    const key = (name: string) => `corpTaxBook.moons.autoSync.result.${name}`;
    switch (returned.status) {
      case 'on':
        return { tone: 'info', text: t(key('on'), { name: returned.name }) };
      case 'mismatch':
        return {
          tone: 'warning',
          text: t(key('mismatch'), {
            authorized: returned.authorizedName,
            expected: names.character(returned.expectedCharacterId),
          }),
        };
      case 'failed':
        return {
          tone: 'warning',
          text: t(returned.reason ? key(`failed.${returned.reason}`) : key('failed.generic'), {
            defaultValue: t(key('failed.generic')),
          }),
        };
      default:
        return { tone: 'info', text: t(key('cancelled')) };
    }
  });
  // Drop the state so a reload does not replay it, and show the holder it just made.
  const handled = useRef<typeof returned>(undefined);
  useEffect(() => {
    if (!returned || handled.current === returned) return;
    handled.current = returned;
    navigate(location.pathname + location.search, { replace: true, state: null });
    reload();
  }, [returned, navigate, location.pathname, location.search, reload]);

  const isHolder = scheduled?.characterId === characterId;
  const active = scheduled?.status === 'active';
  const canTurnOff = scheduled !== null && (isHolder || verdict.isCeo);
  const replaces = active && !isHolder ? scheduled.characterName : null;

  const turnOn = () => {
    setBusy(true);
    setNotice(null);
    void beginCorpSyncLogin(characterId, corporationId).catch(() => setBusy(false));
  };
  const turnOff = async () => {
    setBusy(true);
    const ok = await turnOffScheduledSync({ characterId, corporationId, asCeo: !isHolder });
    setBusy(false);
    setNotice(
      ok ? null : { tone: 'warning', text: t('corpTaxBook.moons.autoSync.result.offFailed') }
    );
    if (ok) reload();
  };

  return (
    <section aria-labelledby="auto-sync-heading" className="space-y-2">
      <h3 id="auto-sync-heading" className={eyebrowClassName}>
        {t('corpTaxBook.moons.autoSync.title')}
      </h3>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.autoSync.hint')}</p>
      <p
        data-testid="auto-sync-state"
        className={active || !scheduled ? 'text-text' : 'text-warning'}
      >
        {scheduled === null
          ? t('corpTaxBook.moons.autoSync.state.off')
          : active
            ? t('corpTaxBook.moons.autoSync.state.on', { name: scheduled.characterName })
            : t('corpTaxBook.moons.autoSync.state.stopped', {
                name: scheduled.characterName,
                reason: t(
                  `corpTaxBook.moons.autoSync.stopped.${scheduled.stoppedReason ?? 'unknown'}`,
                  {
                    name: scheduled.characterName,
                  }
                ),
              })}
      </p>
      {active && <p className="text-xs text-text-dim">{lastRunLine(t, scheduled.lastRun)}</p>}
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
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          {!(active && isHolder) && (
            <NeedsConnection>
              <Button size="sm" variant="primary" loading={busy} disabled={busy} onClick={turnOn}>
                {t(
                  active || scheduled?.status === 'stopped'
                    ? 'corpTaxBook.moons.autoSync.turnOnAgain'
                    : 'corpTaxBook.moons.autoSync.turnOn',
                  { name: localNames.get(characterId) ?? names.character(characterId) }
                )}
              </Button>
            </NeedsConnection>
          )}
          {canTurnOff && active && (
            <Button size="sm" disabled={busy} onClick={() => void turnOff()}>
              {isHolder
                ? t('corpTaxBook.moons.autoSync.turnOff')
                : t('corpTaxBook.moons.autoSync.revoke', { name: scheduled.characterName })}
            </Button>
          )}
          {replaces && (
            <span className="text-xs text-text-dim">
              {t('corpTaxBook.moons.autoSync.replaces', { name: replaces })}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-dim">{t('corpTaxBook.moons.autoSync.editorsOnly')}</p>
      )}
      <p className="text-[0.6875rem] text-text-dim">{t('corpTaxBook.moons.autoSync.stores')}</p>
    </section>
  );
}

function lastRunLine(t: ReturnType<typeof useTranslation>['t'], run: ScheduledSyncRun | undefined) {
  if (!run) return t('corpTaxBook.moons.autoSync.neverRan');
  const age = formatAge(Math.max(0, Date.now() - run.at), t);
  if (run.outcome === 'skipped') {
    return t('corpTaxBook.moons.autoSync.lastSkipped', {
      age,
      reason: t(`corpTaxBook.moons.autoSync.skipped.${run.reason ?? 'esi-unavailable'}`, {
        defaultValue: t('corpTaxBook.moons.autoSync.skipped.esi-unavailable'),
      }),
    });
  }
  const missing = (run.missing ?? []).map((m) => t(`corpTaxBook.moons.autoSync.missing.${m}`));
  return [
    t('corpTaxBook.moons.autoSync.lastRan', {
      age,
      rows: run.observedRows ?? 0,
      donations: run.donationsAdded ?? 0,
      settled: run.settled ?? 0,
    }),
    ...(missing.length > 0
      ? [t('corpTaxBook.moons.autoSync.couldNotRead', { sources: missing.join(', ') })]
      : []),
  ].join(' ');
}
