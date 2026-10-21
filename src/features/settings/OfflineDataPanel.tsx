import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Fields, LiveStatus, Panel, ProgressBar } from '@/components/ui';
import { NeedsConnection } from '@/components/ui/NeedsConnection';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { onReconnect, useOnline } from '@/stores/network';
import { readPersisted, requestPersistence } from '@/lib/persistStorage';
import { formatBytes } from './offlinePacks';
import { SettingsHint } from '@/features/settings/settingsFields';
import {
  cancelDownload,
  downloadEverything,
  readOfflineStatus,
  readStorageEstimate,
  type DownloadOutcome,
  type OfflineStatus,
  type StorageEstimate,
} from './offlineStatus';

type Run = { phase: 'idle' } | { phase: 'running'; done: number; total: number };

/** What the last download ended in, for the line under the button; `null` before one has run. */
type Result =
  | { kind: 'complete' }
  | { kind: 'failed'; count: number }
  | { kind: 'cancelled' }
  | { kind: 'noServiceWorker' }
  | null;

/** The pack lines catch up this often while a download runs. */
const REFRESH_EVERY_FILES = 8;

/**
 * Settings → Offline data. What the app has stored for use with no
 * connection (the lazy SDE files, grouped by pack, and the fitting engine),
 * how much storage that is, whether the browser may evict it, and one button
 * that downloads everything regardless of the cellular / Save-Data gate the
 * background warm obeys. Status is read from Cache Storage, so it shows what
 * is really there, not what a past download reported.
 */
export function OfflineDataPanel() {
  const { t } = useTranslation();
  const online = useOnline();
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [persistDenied, setPersistDenied] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [run, setRun] = useState<Run>({ phase: 'idle' });
  const [result, setResult] = useState<Result>(null);
  const [announcement, setAnnouncement] = useState('');
  const [announceKey, setAnnounceKey] = useState(0);
  const mounted = useRef(true);
  const persistRef = useRef<HTMLDivElement>(null);
  const persistingRef = useRef(false);
  const focusAfterCommit = useFocusAfterCommit();

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
    setAnnounceKey((key) => key + 1);
  }, []);

  const refresh = useCallback(async () => {
    const [nextStatus, nextEstimate, nextPersisted] = await Promise.all([
      readOfflineStatus(),
      readStorageEstimate(),
      readPersisted(),
    ]);
    if (!mounted.current) return nextStatus;
    setStatus(nextStatus);
    setEstimate(nextEstimate);
    setPersisted(nextPersisted);
    return nextStatus;
  }, []);

  const running = run.phase === 'running';
  const [focusRef, , holdFocus] = useRetryFocus<HTMLDivElement>(
    running ? 'busy' : result?.kind === 'failed' ? 'failed' : 'ok',
    null
  );

  const download = useCallback(async () => {
    setResult(null);
    setRun({ phase: 'running', done: 0, total: 0 });
    announce(t('settings.offline.starting'));
    let outcome: DownloadOutcome = 'done';
    try {
      outcome = await downloadEverything((done, total) => {
        if (!mounted.current) return;
        setRun({ phase: 'running', done, total });
        // Pack lines move as the files land, not only at the end.
        if (done % REFRESH_EVERY_FILES === 0) void refresh();
      });
    } catch {
      // Whatever did not arrive shows in the re-read status below.
    }
    const after = await refresh();
    if (!mounted.current) return;
    const missing = after.total - after.totalCached;
    setRun({ phase: 'idle' });
    const next: NonNullable<Result> =
      outcome === 'cancelled'
        ? { kind: 'cancelled' }
        : outcome === 'no-service-worker'
          ? { kind: 'noServiceWorker' }
          : missing > 0
            ? { kind: 'failed', count: missing }
            : { kind: 'complete' };
    setResult(next);
    announce(
      next.kind === 'failed'
        ? t('settings.offline.failed', { count: next.count })
        : t(`settings.offline.${next.kind}`)
    );
  }, [announce, refresh, t]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const unsubscribe = onReconnect(() => void refresh());
    return () => {
      mounted.current = false;
      unsubscribe();
      // Leaving the page stops the pass after the file in flight; a hung file costs up to its idle timeout.
      cancelDownload();
    };
  }, [refresh]);

  async function protect() {
    if (persistingRef.current) return;
    persistingRef.current = true;
    setPersisting(true);
    try {
      const outcome = await requestPersistence();
      const now = await readPersisted();
      if (!mounted.current) return;
      // The Protect button leaves once storage is persisted: focus its wrapper, not `<body>`.
      if (outcome === 'granted') focusAfterCommit(persistRef);
      setPersisted(outcome === 'granted' ? true : now);
      setPersistDenied(outcome !== 'granted');
      announce(
        t(
          outcome === 'granted'
            ? 'settings.offline.persistGranted'
            : 'settings.offline.persistDenied'
        )
      );
    } finally {
      persistingRef.current = false;
      if (mounted.current) setPersisting(false);
    }
  }

  return (
    <Panel>
      <LiveStatus announceKey={announceKey}>{announcement}</LiveStatus>
      <div className="space-y-4">
        <SettingsHint>{t('settings.offline.hint')}</SettingsHint>
        <Fields variant="form">
          <Field label={t('settings.offline.packsLabel')}>
            {status && (
              <ul className="space-y-0.5 text-xs" data-testid="offline-packs">
                {status.packs.map((pack) => (
                  <li key={pack.id}>
                    {t('settings.offline.packLine', {
                      name: t(`settings.offline.packs.${pack.id}`),
                      count: pack.total,
                      cached: pack.cached,
                      total: pack.total,
                    })}
                  </li>
                ))}
                <li>
                  {t(
                    status.engine
                      ? 'settings.offline.engineLine'
                      : 'settings.offline.engineLineMissing',
                    { name: t('settings.offline.engineName') }
                  )}
                </li>
              </ul>
            )}
          </Field>
          {estimate && (
            <Field label={t('settings.offline.storageLabel')}>
              <p className="text-xs">
                {t('settings.offline.storageValue', {
                  used: formatBytes(estimate.usage),
                  quota: formatBytes(estimate.quota),
                })}
              </p>
            </Field>
          )}
          <Field label={t('settings.offline.persistLabel')}>
            <div ref={persistRef} tabIndex={-1} className="space-y-1.5 outline-none">
              <SettingsHint>
                {persisted === null
                  ? t('settings.offline.persistedUnknown')
                  : t(persisted ? 'settings.offline.persistedYes' : 'settings.offline.persistedNo')}
              </SettingsHint>
              {persisted === false && (
                <Button size="sm" loading={persisting} onClick={() => void protect()}>
                  {t('settings.offline.persistAction')}
                </Button>
              )}
              {persisted === false && persistDenied && (
                <SettingsHint>{t('settings.offline.persistDenied')}</SettingsHint>
              )}
            </div>
          </Field>
          <Field
            label={t('settings.offline.downloadLabel')}
            note={t('settings.offline.downloadHint')}
          >
            <div ref={focusRef} tabIndex={-1} className="space-y-1.5 outline-none">
              <div className="flex flex-wrap items-center gap-2">
                <NeedsConnection>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={running}
                    onClick={() => {
                      if (!running) void download();
                    }}
                  >
                    {t('settings.offline.downloadAction')}
                  </Button>
                </NeedsConnection>
                {running && (
                  <Button
                    size="sm"
                    onClick={() => {
                      holdFocus();
                      cancelDownload();
                    }}
                  >
                    {t('settings.offline.cancel')}
                  </Button>
                )}
              </div>
              {!online && (
                <p className="text-xs text-text-dim">{t('settings.offline.needsConnection')}</p>
              )}
              {run.phase === 'running' && (
                <div className="max-w-xs space-y-1">
                  <ProgressBar
                    label={t('settings.offline.downloadAction')}
                    value={run.total > 0 ? run.done : null}
                    max={Math.max(run.total, 1)}
                  />
                  <p className="text-xs text-text-dim">
                    {run.total > 0
                      ? t('settings.offline.progress', { done: run.done, total: run.total })
                      : t('settings.offline.starting')}
                  </p>
                </div>
              )}
              {!running && result && (
                <p className="text-xs text-text-dim">
                  {result.kind === 'failed'
                    ? t('settings.offline.failed', { count: result.count })
                    : t(`settings.offline.${result.kind}`)}
                </p>
              )}
              {!running && result?.kind === 'failed' && (
                <NeedsConnection>
                  <Button
                    size="sm"
                    onClick={() => {
                      holdFocus();
                      void download();
                    }}
                  >
                    {t('settings.offline.retry')}
                  </Button>
                </NeedsConnection>
              )}
            </div>
          </Field>
        </Fields>
      </div>
    </Panel>
  );
}
