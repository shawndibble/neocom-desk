/**
 * "Open in EVE" for a row or context menu: opens the target's window in the
 * active Character's EVE client. The menu stays open while it sends and the
 * item reads "Opening in EVE…" and then the outcome — there is no toast to
 * report to once the menu closes, and ESI's commonest refusal (the character
 * isn't logged in to the game) must not fail silently. Same shape as
 * `SetWaypointMenuItem`. No Character, or one without the permission, gets it
 * inert with the reason on tap.
 */
import { useTranslation } from 'react-i18next';
import { GrantMissingMenuItem } from '@/app/GrantMissingLink';
import { DisabledMenuItem, MenuItem } from '@/components/ui';
import type { OpenInEveTarget } from './sendOpenInEve';
import { useOpenInEve } from './useOpenInEve';

export function OpenInEveMenuItem({ kind, id }: OpenInEveTarget) {
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
  const label = t(`openInEve.${kind}`);
  // Kept when the connection drops mid-send, so the result is still shown in the blocked branch.
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
      disabled={sending}
      onSelect={(event) => {
        event.preventDefault();
        send();
      }}
    >
      {content}
    </MenuItem>
  );
}
