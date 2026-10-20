import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Fields, Panel, TextInput } from '@/components/ui';
import { exportBackupToFile } from '@/backup/io';
import { ActionResult, SettingsHint } from '@/features/settings/settingsFields';

/**
 * Every Character on this device, encrypted under a password and downloaded
 * as a JSON file — the escape hatch for a new device that would otherwise
 * need EVE SSO re-run per alt (issue #789,
 * docs/adr/0014-encrypted-device-backup-for-cross-device-setup.md).
 * No character picker: always every Character, since the whole point is one
 * file that replaces re-login for all of them at once.
 */
export function ExportPanel() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle');

  const canExport = password.length > 0;

  async function handleExport() {
    setStatus('exporting');
    try {
      await exportBackupToFile(password);
      setPassword('');
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
  }

  return (
    <Panel title={t('settings.backup.exportTitle')}>
      <div className="space-y-2">
        <SettingsHint>{t('settings.backup.exportHint')}</SettingsHint>
        <p className="max-w-2xl text-xs text-warning">{t('settings.backup.passwordWarning')}</p>
        <Fields variant="form">
          <Field
            label={t('settings.backup.passwordLabel')}
            htmlFor="settings-backup-export-password"
          >
            <TextInput
              id="settings-backup-export-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="max-w-xs min-w-0 flex-1 basis-48"
            />
            <Button
              size="sm"
              aria-disabled={!canExport || status === 'exporting'}
              onClick={() => void handleExport()}
            >
              {t('settings.backup.exportButton')}
            </Button>
          </Field>
        </Fields>
        {status === 'done' && (
          <ActionResult kind="success">{t('settings.backup.exportDone')}</ActionResult>
        )}
        {status === 'error' && (
          <ActionResult kind="error">{t('settings.backup.exportError')}</ActionResult>
        )}
      </div>
    </Panel>
  );
}
