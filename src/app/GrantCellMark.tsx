import { useTranslation } from 'react-i18next';
import { PermissionCellMark } from '@/components/ui';
import { PERMISSIONS } from '@/esi/registry';
import { usePermissionMarkDismissals } from '@/features/permissions/permissionMarkDismissals';
import { GrantMissingLink } from './GrantMissingLink';
import { beginEveLogin } from './loginFlow';
import { usePermissionMark, type PermissionNeed } from './usePermissionMark';

export type GrantCellMarkProps = PermissionNeed & {
  /** The row's Character: whose grant decides it, and whom Grant in EVE is for. */
  characterId: number;
  /** The Character's name, when the caller has it; read from the device otherwise. */
  characterName?: string;
  /** One short line on what it is needed for; the Permission's own caption when omitted. */
  why?: string;
  defaultOpen?: boolean;
  /** The popover's title, given the missing Permissions' labels (a mark about several Characters). */
  title?: (permissions: string) => string;
  /** Grant in EVE's label in place of the plain one (to name whose grant it starts). */
  grantLabel?: string;
};

/**
 * `PermissionCellMark` wired up (issue #6704): the amber mark after a figure or
 * control whose row's Character lacks a Permission, rendering nothing once
 * granted or dismissed. Grant in EVE starts a grant for `characterId`, never
 * the active Character (SSO issues exactly what was asked for, so the wrong
 * Character would get the scope). Don't ask again silences every Character's
 * mark for those Permissions, on every device; Settings › Permissions undoes
 * it. Not for a menu item: those keep `DisabledMenuItem` and
 * `GrantMissingMenuItem`.
 */
export function GrantCellMark({
  characterId,
  characterName,
  why,
  defaultOpen,
  title,
  grantLabel,
  ...need
}: GrantCellMarkProps) {
  const { t } = useTranslation();
  const state = usePermissionMark(characterId, need as PermissionNeed);
  const { dismiss } = usePermissionMarkDismissals();
  if (state?.status !== 'missing') return null;
  const { asking } = state;
  const first = asking[0];
  const labels = asking.map((group) => t(PERMISSIONS[group].labelKey));
  return (
    <PermissionCellMark
      status="missing"
      character={characterName ?? state.storedName ?? t('reauth.unknownCharacter')}
      permissions={labels}
      title={title?.(labels.join(', '))}
      grantLabel={grantLabel}
      why={why ?? (first ? t(PERMISSIONS[first].captionKey) : '')}
      // `beginGrant`'s own call, minus its endpoints-to-groups step: the mark may name a
      // Permission directly, and asks only for the ones not dismissed.
      onGrant={() => void beginEveLogin({ characterId, groups: [...asking] })}
      onDismiss={() => void dismiss(asking)}
      settingsLink={<GrantMissingLink groups={asking} asCharacter={characterId} />}
      defaultOpen={defaultOpen ?? false}
    />
  );
}
