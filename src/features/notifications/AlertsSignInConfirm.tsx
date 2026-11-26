import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Tooltip } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import {
  ALERTS_PERMISSIONS,
  planAlertsWalk,
  type AlertsPermission,
  type CharacterAlertsNeed,
} from './alertsNeeds';
import { DividedList } from '@/components/ui/DividedList';

interface Props {
  needs: readonly CharacterAlertsNeed[];
  names: ReadonlyMap<number, string>;
  busy: boolean;
  onCancel: () => void;
  onContinue: (include: { location: boolean; mail: boolean }) => void;
}

export function AlertsSignInConfirm({ needs, names, busy, onCancel, onContinue }: Props) {
  const { t } = useTranslation();
  const [include, setInclude] = useState({ location: true, mail: true });
  const key = (name: string) => `settings.notifications.alertsWhenClosed.confirm.${name}`;
  const asked = ALERTS_PERMISSIONS.filter((permission) =>
    needs.some((need) => need.missing.includes(permission))
  );
  const steps = planAlertsWalk(needs, include);
  const forWhom = (permission: AlertsPermission) =>
    needs.filter((need) => need.missing.includes(permission));

  return (
    <div className="space-y-3">
      <p className="text-xs text-text">{t(key('intro'), { count: steps.length })}</p>
      <DividedList surface="none" as="ul">
        {asked.map((permission) => {
          const optional = permission !== 'notifications';
          const who = forWhom(permission);
          const included = !optional || include[permission];
          return (
            <li key={permission} className="space-y-1 px-3 py-2 text-xs">
              <label className={cx('flex items-start gap-2 text-text', tappableRowClassName)}>
                {optional ? (
                  <Checkbox
                    className="mt-0.5"
                    checked={included}
                    onChange={() =>
                      setInclude((current) => ({ ...current, [permission]: !current[permission] }))
                    }
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t(key(`${permission}.label`))}</span>
                  <span className="block text-[0.6875rem] text-text-dim">
                    {t(key(`${permission}.why`))}
                  </span>
                </span>
              </label>
              <p className="text-[0.6875rem] text-text-dim">
                {who.length > 3
                  ? t(key('forMany'), { count: who.length })
                  : t(key('forCharacters'), {
                      list: who
                        .map((need) => names.get(need.characterId) ?? need.characterId)
                        .join(', '),
                    })}
              </p>
              {optional && !included && (
                <p className="text-[0.6875rem] text-warning">{t(key(`${permission}.leftOut`))}</p>
              )}
            </li>
          );
        })}
      </DividedList>
      <p className="text-[0.6875rem] text-text-dim">{t(key('tokenNote'))}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} aria-disabled={busy || undefined}>
          {t(key('back'))}
        </Button>
        <Tooltip content={steps.length === 0 ? t('common.nothingToDo') : null}>
          <Button
            size="sm"
            loading={busy}
            aria-disabled={steps.length === 0 || undefined}
            onClick={() => onContinue(include)}
          >
            {t(key('continue'))}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
