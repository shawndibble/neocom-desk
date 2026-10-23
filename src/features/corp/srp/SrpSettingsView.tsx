/**
 * `/corp/srp` Settings: the Director's view of the corp's SRP. Picks the state
 * `useSrpSettings` reports: the form, the first-time "Turn on SRP", or a line for an officer who
 * may approve claims but not change settings. Hidden, never locked: Accountants never see the form.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, LoadFailedState, Panel, Spinner } from '@/components/ui';
import { ActionResult, SettingsHint } from '@/features/settings/settingsFields';
import { SrpSettingsEditor } from './SrpSettingsEditor';
import { useSrpSettings } from './useSrpSettings';

function FirstTime({ onTurnOn }: { onTurnOn: () => Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const turnOn = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onTurnOn();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title={t('srp.settings.programTitle')}>
      <EmptyState
        title={t('srp.settings.firstTime.title')}
        hint={t('srp.settings.firstTime.hint')}
        action={
          <Button
            variant="primary"
            className="max-sm:w-full"
            loading={busy}
            onClick={() => void turnOn()}
          >
            {t('srp.settings.firstTime.action')}
          </Button>
        }
      />
      <div className="grid gap-2 px-3 pb-3">
        {failed && <ActionResult kind="error">{t('srp.settings.firstTime.failed')}</ActionResult>}
        <SettingsHint>{t('srp.settings.firstTime.note')}</SettingsHint>
      </div>
    </Panel>
  );
}

export function SrpSettingsView() {
  const { t } = useTranslation();
  const data = useSrpSettings();
  const [saveFailed, setSaveFailed] = useState(false);
  // A half-done save reloads and remounts the form, so the failure line lives here.
  const save: typeof data.save = async (patch, enabled) => {
    setSaveFailed(false);
    try {
      await data.save(patch, enabled);
    } catch {
      setSaveFailed(true);
    }
  };
  const { state } = data;
  switch (state.status) {
    case 'loading':
      return <Spinner label={t('common.loading')} />;
    case 'denied':
      return (
        <EmptyState title={t('srp.settings.deniedTitle')} hint={t('srp.settings.deniedHint')} />
      );
    case 'failed':
      return <LoadFailedState title={t('srp.settings.loadFailed')} onRetry={data.reload} />;
    case 'not-director':
      return (
        <EmptyState
          title={t('srp.settings.directorOnlyTitle')}
          hint={t('srp.settings.directorOnlyHint')}
        />
      );
    case 'never-on':
      return <FirstTime onTurnOn={data.turnOn} />;
    case 'ready':
      return (
        <SrpSettingsEditor
          // A reload hands back new settings: start the form from them.
          key={state.settings.updatedAt}
          settings={state.settings}
          verdict={state.verdict}
          characterId={data.characterId ?? 0}
          onSave={save}
          saveFailed={saveFailed}
          onReclaim={data.reclaim}
        />
      );
  }
}
