import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Fields, LiveStatus, Panel, ProgressBar } from '@/components/ui';
import { NeedsConnection } from '@/components/ui/NeedsConnection';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { formatBytes } from './offlinePacks';
import {
  downloadEverything,
  readOfflineStatus,
  readStorageEstimate,
  type OfflineStatus,
  type StorageEstimate,
} from './offlineStatus';
import { readPersisted, requestPersistence } from './persistStorage';

type Run = { phase: 'idle' } | { phase: 'running'; done: number; total: number };

/**
 * Settings → Offline data. What the app has stored for use with no
 * connection (the lazy SDE files, grouped by pack, and the fitting engine),
 * how much storage that is, whether the browser may evict it, and one button
 * that downloads everything regardless of the cellular / Save-Data gate the
 * background warm obeys. Status is read from Cache Storage, so it shows what
 * is really there, not what a past download reported.
 */
export function OfflineDataPanel() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [persistDenied, setPersistDenied] = useState(false);
  const [run, setRun] = useState<Run>({ phase: 'idle' });
  /** Items still missing after the last download; `null` before the pilot has run one. */
  const [failed, setFailed] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [announceKey, setAnnounceKey] = useState(0);
  const mounted = useRef(true);
  const persistRef = useRef<HTMLDivElement>(null);
  /** The Protect button leaves once granted: focus moves to its wrapper, not `<body>`. */
  const focusPersist = useRef(false);

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

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!focusPersist.current || persisted !== true) return;
    focusPersist.current = false;
    persistRef.current?.focus({ preventScroll: true });
  }, [persisted]);

  const running = run.phase === 'running';
  const [focusRef, , holdFocus] = useRetryFocus<HTMLDivElement>(
    running ? 'busy' : failed ? 'failed' : 'ok',
    null
  );

  async function download() {
    if (running) return;
    setFailed(null);
    setRun({ phase: 'running', done: 0, total: status?.total ?? 0 });
    try {
      await downloadEverything((done, total) => {
        if (mounted.current) setRun({ phase: 'running', done, total });
      });
    } catch {
      // Whatever did not arrive shows in the re-read status below.
    }
    const after = await refresh();
    if (!mounted.current) return;
    const missing = after.total - after.totalCached;
    setRun({ phase: 'idle' });
    setFailed(missing);
    announce(
      missing > 0
        ? t('settings.offline.failed', { count: missing })
        : t('settings.offline.complete')
    );
  }

  async function protect() {
    focusPersist.current = true;
    const result = await requestPersistence();
    const now = await readPersisted();
    if (!mounted.current) return;
    focusPersist.current = now === true;
    setPersisted(now);
    setPersistDenied(result !== 'granted');
    if (result === 'granted') announce(t('settings.offline.persistGranted'));
  }

  const packLabel = (id: string) => t(`settings.offline.packs.${id}`);

  return (
    <Panel title={t('settings.offline.title')}>
      <LiveStatus announceKey={announceKey}>{announcement}</LiveStatus>
      <div className="space-y-4">
        <p className="max-w-2xl text-xs text-text-dim">{t('settings.offline.hint')}</p>
        <Fields variant="form">
          <Field label={t('settings.offline.packsLabel')}>
            {status && (
              <ul className="space-y-0.5 text-xs" data-testid="offline-packs">
                {status.packs.map((pack) => (
                  <li key={pack.id}>
                    {t('settings.offline.packLine', {
                      name: packLabel(pack.id),
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
                  used: formatBytes(estimate.usage, i18n.language),
                  quota: formatBytes(estimate.quota, i18n.language),
                })}
              </p>
            </Field>
          )}
          <Field label={t('settings.offline.persistLabel')}>
            <div ref={persistRef} tabIndex={-1} className="space-y-1.5 outline-none">
              <p className="max-w-2xl text-xs text-text-dim">
                {persisted === null
                  ? t('settings.offline.persistedUnknown')
                  : t(persisted ? 'settings.offline.persistedYes' : 'settings.offline.persistedNo')}
              </p>
              {persisted === false && (
                <Button size="sm" onClick={() => void protect()}>
                  {t('settings.offline.persistAction')}
                </Button>
              )}
              {persisted === false && persistDenied && (
                <p className="max-w-2xl text-xs text-text-dim">
                  {t('settings.offline.persistDenied')}
                </p>
              )}
            </div>
          </Field>
          <Field
            label={t('settings.offline.downloadLabel')}
            note={t('settings.offline.downloadHint')}
          >
            <div ref={focusRef} tabIndex={-1} className="space-y-1.5 outline-none">
              <NeedsConnection>
                <Button
                  size="sm"
                  variant="primary"
                  loading={running}
                  onClick={() => void download()}
                >
                  {t('settings.offline.downloadAction')}
                </Button>
              </NeedsConnection>
              {run.phase === 'running' && (
                <div className="max-w-xs space-y-1">
                  <ProgressBar
                    label={t('settings.offline.downloadAction')}
                    value={run.done}
                    max={Math.max(run.total, 1)}
                  />
                  <p className="text-xs text-text-dim">
                    {t('settings.offline.progress', { done: run.done, total: run.total })}
                  </p>
                </div>
              )}
              {!running && failed !== null && (
                <p className="text-xs text-text-dim">
                  {failed > 0
                    ? t('settings.offline.failed', { count: failed })
                    : t('settings.offline.complete')}
                </p>
              )}
              {!running && failed !== null && failed > 0 && (
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
