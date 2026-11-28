import { formatCount } from '@/lib/formatCount';
import type { ReactNode } from 'react';
import { PageHeaderClusterContext } from '@/components/ui/pageHeaderCluster';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { AlertsBell, StatChip, StatChips } from '@/components/ui';
import { CharacterIdentity, CharacterPortrait } from './CharacterIdentity';
import { useCharacterIdentity } from './useCharacterIdentity';

interface CharacterHeaderProps {
  characterId: number;
  totalSp?: number | null;
  unallocatedSp?: number | null;
  overview?: boolean;
  aside?: ReactNode;
  scope?: ReactNode;
  actions?: ReactNode;
}

export function CharacterHeader({
  characterId,
  totalSp,
  unallocatedSp,
  overview = false,
  aside,
  scope,
  actions,
}: CharacterHeaderProps) {
  const { t } = useTranslation();
  const identity = useCharacterIdentity(characterId);

  const sp = (value: number | null | undefined): string =>
    value == null ? t('common.unknown') : formatCount(value);
  const showSp = totalSp !== undefined || unallocatedSp !== undefined;

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <CharacterPortrait characterId={characterId} name={identity.name} />
      <div className={cx('min-w-0 flex-1', overview || actions ? 'basis-36' : 'basis-48')}>
        <CharacterIdentity characterId={characterId} identity={identity} aside={aside} />
      </div>
      {scope && (
        <PageHeaderClusterContext.Provider value={true}>{scope}</PageHeaderClusterContext.Provider>
      )}
      {showSp && (
        <StatChips>
          <StatChip label={t('skills.totalSp')} value={sp(totalSp)} />
          <StatChip label={t('skills.unallocatedSp')} value={sp(unallocatedSp)} />
        </StatChips>
      )}
      {actions}
      <AlertsBell showWhenEmpty={overview ? true : undefined} />
    </header>
  );
}
