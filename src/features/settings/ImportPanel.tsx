import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Fields, Panel, TextInput } from '@/components/ui';
import { importBackup, type ImportSummary } from '@/backup/io';

/**
 * The counterpart to {@link ExportPanel}. Conflict policy (issue #789, not
 * relitigated here): a Character already on this device is skipped whole —
 * its token and data are untouched — a new Character is written in full.
 */
export function ImportPanel() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'importing' | 'error'>('idle');
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function handleImport() {
    if (!file) return;
    setStatus('importing');
    setSummary(null);
    try {
      const contents = await file.text();
      const result = await importBackup(contents, password);
      setSummary(result);
      setPassword('');
      setFile(null);
      setStatus('idle');
      // A newly-added character's token needs `ensureSignedIn`/`planSync` to
      // run before it's usable, and any imported `sync.` setting is already
      // on disk but not in the zustand store that read it at boot — same gap
      // `ResetViewPreferences` above hits, and the same fix: reload once the
      // pilot has had a moment to read the summary below.
      if (result.addedCharacterIds.length > 0 || result.addedSettingKeys.length > 0) {
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch {
      setStatus('error');
    }
  }

  return (
    <Panel title={t('settings.backup.importTitle')}>
      <div className="space-y-2">
        <p className="max-w-2xl text-xs text-text-dim">{t('settings.backup.importHint')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          aria-label={t('settings.backup.fileLabel')}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            {t('settings.backup.chooseFile')}
          </Button>
          <span className="min-w-0 truncate text-xs text-text-dim">
            {file ? file.name : t('settings.backup.noFileChosen')}
          </span>
        </div>
        <Fields variant="form">
          <Field
            label={t('settings.backup.passwordLabel')}
            htmlFor="settings-backup-import-password"
          >
            <TextInput
              id="settings-backup-import-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="max-w-xs min-w-0 flex-1 basis-48"
            />
            <Button
              size="md"
              aria-disabled={!file || password.length === 0 || status === 'importing'}
              onClick={() => void handleImport()}
            >
              {t('settings.backup.importButton')}
            </Button>
          </Field>
        </Fields>
        {status === 'error' && (
          <p role="alert" className="text-xs text-danger">
            {t('settings.backup.importError')}
          </p>
        )}
        {summary && (
          <p role="status" aria-live="polite" className="text-xs text-success">
            {t('settings.backup.importSummary', {
              added: summary.addedCharacterIds.length,
              skipped: summary.skippedCharacterIds.length,
            })}
            {(summary.addedCharacterIds.length > 0 || summary.addedSettingKeys.length > 0) &&
              ` ${t('settings.backup.importReloading')}`}
          </p>
        )}
      </div>
    </Panel>
  );
}
