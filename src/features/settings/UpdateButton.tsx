import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { forceUpdate } from '@/app/forceUpdate';
import { isUpdateAvailable } from '@/app/updateAvailable';
import { ActionResult } from '@/features/settings/settingsFields';

/**
 * Settings nav → "Update app". Checks for a new build as soon as Settings
 * opens and lights up (accent outline) when one is waiting; otherwise it reads
 * muted but stays pressable, since the check can miss (offline, slow worker).
 * Pressing applies a waiting build through the boot-screen cover, or reloads.
 */
export function UpdateButton() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void isUpdateAvailable().then((found) => {
      if (live) setAvailable(found);
    });
    return () => {
      live = false;
    };
  }, []);

  async function update() {
    setUpdating(true);
    setFailed(false);
    if ((await forceUpdate()) === 'failed') {
      setFailed(true);
      setUpdating(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant={available ? 'accent' : 'ghost'}
        className={available ? undefined : 'text-text-dim!'}
        loading={updating}
        onClick={() => void update()}
      >
        {t('settings.updateAction')}
      </Button>
      {failed && <ActionResult kind="error">{t('settings.updateFailed')}</ActionResult>}
    </>
  );
}
