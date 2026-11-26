import { useTranslation } from 'react-i18next';
import { PermissionCellMark } from '@/components/ui';

const noop = () => {};

export function TurnInSampleMark({
  character,
  permission,
  why,
  defaultOpen = false,
}: {
  character: string;
  permission: string;
  why: string;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <PermissionCellMark
      status="missing"
      character={character}
      permissions={[permission]}
      why={why}
      onGrant={noop}
      onDismiss={noop}
      settingsLink={<span className="text-accent">{t('permissions.grantMissing')}</span>}
      defaultOpen={defaultOpen}
    />
  );
}
