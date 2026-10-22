import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { ScopeGroup } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { grantMissingPath } from './grantMissingPath';

/**
 * The one line every "this Character hasn't granted X" message shrinks to:
 * a plain text link to the Permissions page, which flashes the Grant button for
 * each of `groups`. Deliberately not a Button, and no 44px touch target: it
 * sits inline in a sentence-sized slot (DESIGN.md §6c, inline link).
 */
export function GrantMissingLink({
  groups,
  asCharacter,
}: {
  groups: readonly ScopeGroup[];
  /**
   * The Character lacking them, when it isn't the active one: Permissions
   * shows the active Character, so the link switches to it first.
   */
  asCharacter?: number;
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
      {t('permissions.grantMissing')}
    </Link>
  );
}

/**
 * The menu twin: a bubble can't carry a link (it ignores the pointer), so a
 * row menu whose action is blocked by a missing Permission lists this item
 * under the inert one.
 */
export function GrantMissingMenuItem({ groups }: { groups: readonly ScopeGroup[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <MenuItem onSelect={() => navigate(grantMissingPath(groups))}>
      {t('permissions.grantMissing')}
    </MenuItem>
  );
}
