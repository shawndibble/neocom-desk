import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { forceUpdate } from '@/app/forceUpdate';

/** Settings → Data & storage → App updates. Skips ReloadPrompt's wait for a quiet moment. */
export function UpdatePanel() {
  const { t } = useTranslation();
  const [updating, setUpdating] = useState(false);
  const [failed, setFailed] = useState(false);

  async function update() {
    setUpdating(true);
    setFailed(false);
    if ((await forceUpdate()) === 'failed') {
      setFailed(true);
      setUpdating(false);
    }
  }

  return (
    <Panel title={t('settings.updateTitle')}>
      <div className="max-w-md space-y-1.5">
        <p className="text-xs text-text-dim">{t('settings.updateHint')}</p>
        <Button size="sm" disabled={updating} onClick={() => void update()}>
          {t(updating ? 'settings.updateWorking' : 'settings.updateAction')}
        </Button>
        {failed && (
          <p role="alert" className="text-xs text-danger">
            {t('settings.updateFailed')}
          </p>
        )}
      </div>
    </Panel>
  );
}
