import { formatCount } from '@/lib/formatCount';
import { useEffect, type ReactNode } from 'react';
import { PageHeaderClusterContext } from '@/components/ui/pageHeaderCluster';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { cx } from '@/lib/cx';
import { AlertsBell, CharacterAvatar, StatChip, StatChips } from '@/components/ui';
import { AllianceLink, CorporationLink } from '@/features/entities';
import { usePublicInfo } from '@/stores/publicInfo';
import { CharacterAchievementLine } from './AchievementLine';

interface CharacterHeaderProps {
  characterId: number;
  totalSp?: number | null;
  unallocatedSp?: number | null;
  overview?: boolean;
  compact?: boolean;
  corner?: ReactNode;
  below?: ReactNode;
  aside?: ReactNode;
  scope?: ReactNode;
  actions?: ReactNode;
}

export function CharacterHeader({
  characterId,
  totalSp,
  unallocatedSp,
  overview = false,
  compact = false,
  corner,
  below,
  aside,
  scope,
  actions,
}: CharacterHeaderProps) {
  const { t } = useTranslation();
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const publicInfo = usePublicInfo((state) => state.byCharacterId[characterId]);
  const loadPublicInfo = usePublicInfo((state) => state.load);

  useEffect(() => {
    void loadPublicInfo(characterId);
  }, [characterId, loadPublicInfo]);

  const sp = (value: number | null | undefined): string =>
    value == null ? t('common.unknown') : formatCount(value);
  const showSp = totalSp !== undefined || unallocatedSp !== undefined;
  const affiliationLinkClassName = cx('min-w-0 truncate py-1', compact ? '-my-0.5' : '-my-1');

  const avatar = (
    <CharacterAvatar
      characterId={characterId}
      size="lg"
      priority
      alt={t('characters.portraitAlt', { name: character?.name ?? '' })}
    />
  );

  const identity = (
    <>
      <div className="flex flex-wrap items-center gap-x-3">
        <h1
          tabIndex={-1}
          className={cx(
            'max-w-full min-w-0 text-xl font-semibold tracking-widest uppercase focus:outline-none',
            compact ? 'wrap-break-word' : 'truncate'
          )}
        >
          {character?.name ?? t('common.unknown')}
        </h1>
        {aside}
      </div>
      <p
        className={cx(
          'flex min-w-0 text-xs text-text-dim',
          compact ? 'flex-wrap' : 'whitespace-nowrap'
        )}
      >
        {publicInfo?.corporationName && publicInfo.corporationId !== undefined ? (
          <CorporationLink id={publicInfo.corporationId} className={affiliationLinkClassName}>
            {publicInfo.corporationName}
          </CorporationLink>
        ) : (
          <span className="min-w-0 truncate">
            {publicInfo?.corporationName ?? t('common.unknown')}
          </span>
        )}
        {publicInfo?.allianceName && (
          <>
            <span className="shrink-0 whitespace-pre">{compact ? ' · ' : ' / '}</span>
            {publicInfo.allianceId !== undefined ? (
              <AllianceLink id={publicInfo.allianceId} className={affiliationLinkClassName}>
                {publicInfo.allianceName}
              </AllianceLink>
            ) : (
              <span className="min-w-0 truncate">{publicInfo.allianceName}</span>
            )}
          </>
        )}
      </p>
      <CharacterAchievementLine characterId={characterId} />
    </>
  );

  if (compact) {
    return (
      <header className="space-y-2">
        <div className="flex items-start gap-3">
          {avatar}
          <div className="min-w-0 flex-1">{identity}</div>
          <div className="flex shrink-0 flex-col gap-1">
            <AlertsBell showWhenEmpty />
            {corner}
          </div>
        </div>
        {below}
      </header>
    );
  }

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {avatar}
      <div className={cx('min-w-0 flex-1', overview || actions ? 'basis-36' : 'basis-48')}>
        {identity}
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
