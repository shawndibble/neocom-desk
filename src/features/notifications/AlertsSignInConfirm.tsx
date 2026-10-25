/**
 * The screen before the walk (issue #5156, ADR 0030): what EVE will be asked
 * for, and why, shown and confirmed before any sign-in starts. A tick in the
 * event list never starts a sign-in; the player reads this and presses
 * Continue. Notifications are the grant itself; location and mail are
 * optional and can be left out here, which keeps those alerts to while the
 * app is open. A permission a grant already holds is not listed (it is kept
 * either way, so a re-authorization never drops it).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import {
  ALERTS_PERMISSIONS,
  planAlertsWalk,
  type AlertsPermission,
  type CharacterAlertsNeed,
} from './alertsNeeds';

interface Props {
  /** The Characters this walk would sign in, in order. */
  needs: readonly CharacterAlertsNeed[];
  names: ReadonlyMap<number, string>;
  busy: boolean;
  onCancel: () => void;
  onContinue: (include: { location: boolean; mail: boolean }) => void;
}

export function AlertsSignInConfirm({ needs, names, busy, onCancel, onContinue }: Props) {
  const { t } = useTranslation();
  // On by default: the player ticked (or left) the events and is reading the list; unchecking leaves it out of this walk (ADR 0030).
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
      <ul className="divide-y divide-line rounded-xs border border-line">
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
      </ul>
      <p className="text-[0.6875rem] text-text-dim">{t(key('tokenNote'))}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {t(key('back'))}
        </Button>
        <Button
          size="sm"
          loading={busy}
          disabled={steps.length === 0}
          onClick={() => onContinue(include)}
        >
          {t(key('continue'))}
        </Button>
      </div>
    </div>
  );
}
