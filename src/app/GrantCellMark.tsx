import { useTranslation } from 'react-i18next';
import { PermissionCellMark } from '@/components/ui';
import { PERMISSIONS } from '@/esi/registry';
import { usePermissionMarkDismissals } from '@/features/permissions/permissionMarkDismissals';
import { GrantMissingLink } from './GrantMissingLink';
import { beginEveLogin } from './loginFlow';
import { usePermissionMark, type PermissionNeed } from './usePermissionMark';

export type GrantCellMarkProps = PermissionNeed & {
  characterId: number;
  characterName?: string;
  why?: string;
  defaultOpen?: boolean;
  title?: (permissions: string) => string;
  grantLabel?: string;
};

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
      onGrant={() => void beginEveLogin({ characterId, groups: [...asking] })}
      onDismiss={() => void dismiss(asking)}
      settingsLink={<GrantMissingLink groups={asking} asCharacter={characterId} />}
      defaultOpen={defaultOpen ?? false}
    />
  );
}
