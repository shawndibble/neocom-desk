import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { RequestNotify } from '@/engine/communities/requests';

/**
 * "Tell me when someone Pledges": how the requester hears about a Pledge on
 * this Request, in the app (the bell), by in-game mail from the Pledger, both
 * or neither (the board alone). The mail costs the Pledger one of their own
 * daily mails and only arrives if they grant the Send mail Permission, which
 * the hint says. Used by compose and by the edit dialog, prefilled.
 */
export function RequestNotifyChoice({
  value,
  onChange,
}: {
  value: RequestNotify;
  onChange: (next: RequestNotify) => void;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  return (
    <fieldset className="space-y-1" aria-describedby={hintId}>
      <legend className="text-xs text-text-dim">{t('communities.board.notify.legend')}</legend>
      <div className="flex flex-wrap gap-x-6">
        <label className={`flex items-center gap-2 ${tappableRowClassName}`}>
          <Checkbox
            checked={value.app}
            onChange={(event) => onChange({ ...value, app: event.target.checked })}
          />
          {t('communities.board.notify.app')}
        </label>
        <label className={`flex items-center gap-2 ${tappableRowClassName}`}>
          <Checkbox
            checked={value.mail}
            onChange={(event) => onChange({ ...value, mail: event.target.checked })}
          />
          {t('communities.board.notify.mail')}
        </label>
      </div>
      <p id={hintId} className="text-xs text-text-dim">
        {t('communities.board.notify.hint')}
      </p>
    </fieldset>
  );
}
