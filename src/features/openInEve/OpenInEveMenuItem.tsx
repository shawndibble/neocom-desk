import { useTranslation } from 'react-i18next';
import { GrantMissingMenuItem } from '@/app/GrantMissingLink';
import { DisabledMenuItem, MenuItem } from '@/components/ui';
import type { OpenInEveTarget } from './sendOpenInEve';
import { useOpenInEve } from './useOpenInEve';

export function OpenInEveMenuItem({
  kind,
  id,
  specific = false,
}: OpenInEveTarget & {
  specific?: boolean;
}) {
  const { t } = useTranslation();
  const {
    blockedReason,
    offline,
    missingGroups,
    switchTo,
    switchCharacter,
    sending,
    outcome,
    send,
  } = useOpenInEve({
    kind,
    id,
  });
  const label = specific && kind !== 'information' ? t(`openInEve.${kind}`) : t('openInEve.label');
  const content = sending ? (
    t('openInEve.sending')
  ) : outcome ? (
    <span role={outcome.tone} className={outcome.tone === 'alert' ? 'text-danger' : 'text-success'}>
      {outcome.text}
    </span>
  ) : (
    label
  );

  if (blockedReason !== null) {
    return missingGroups.length > 0 ? (
      <>
        <DisabledMenuItem reason={t('permissions.grantMissing')}>{label}</DisabledMenuItem>
        <GrantMissingMenuItem groups={missingGroups} />
        {switchTo && (
          <MenuItem onSelect={switchCharacter}>
            {t('openInEve.switchTo', { name: switchTo.name })}
          </MenuItem>
        )}
      </>
    ) : (
      <DisabledMenuItem
        reason={offline ? t('common.needsConnection') : t('openInEve.needCharacter')}
      >
        {offline ? content : label}
      </DisabledMenuItem>
    );
  }
  return (
    <MenuItem
      aria-disabled={sending || undefined}
      onSelect={(event) => {
        event.preventDefault();
        if (!sending) send();
      }}
    >
      {content}
    </MenuItem>
  );
}
