import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { ScopeGroup } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { grantMissingPath } from './grantMissingPath';

export function GrantMissingLink({
  groups,
  asCharacter,
  children,
}: {
  groups: readonly ScopeGroup[];
  asCharacter?: number;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={grantMissingPath(groups)}
      className={inlineLinkClassName}
      onClick={
        asCharacter === undefined
          ? undefined
          : () => void useActiveCharacter.getState().setActiveCharacter(asCharacter)
      }
    >
      {children ?? t('permissions.grantMissing')}
    </Link>
  );
}

export function GrantMissingMenuItem({ groups }: { groups: readonly ScopeGroup[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <MenuItem onSelect={() => navigate(grantMissingPath(groups))}>
      {t('permissions.grantMissing')}
    </MenuItem>
  );
}
