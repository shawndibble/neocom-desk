import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { cx } from '@/lib/cx';
import { CharacterAvatar } from '@/components/ui';
import { AllianceLink, CorporationLink } from '@/features/entities';
import { usePublicInfo } from '@/stores/publicInfo';
import { CharacterAchievementLine } from './AchievementLine';

export function useCharacterIdentity(characterId: number) {
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const publicInfo = usePublicInfo((state) => state.byCharacterId[characterId]);
  const loadPublicInfo = usePublicInfo((state) => state.load);

  useEffect(() => {
    void loadPublicInfo(characterId);
  }, [characterId, loadPublicInfo]);

  return { name: character?.name, publicInfo };
}

export function CharacterPortrait({ characterId, name }: { characterId: number; name?: string }) {
  const { t } = useTranslation();
  return (
    <CharacterAvatar
      characterId={characterId}
      size="lg"
      priority
      alt={t('characters.portraitAlt', { name: name ?? '' })}
    />
  );
}

interface CharacterIdentityProps {
  characterId: number;
  identity: ReturnType<typeof useCharacterIdentity>;
  wrapping?: boolean;
  aside?: ReactNode;
}

export function CharacterIdentity({
  characterId,
  identity,
  wrapping = false,
  aside,
}: CharacterIdentityProps) {
  const { t } = useTranslation();
  const { name, publicInfo } = identity;
  const linkClassName = cx('min-w-0 py-1', wrapping ? '-my-0.5' : '-my-1 truncate');

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3">
        <h1
          tabIndex={-1}
          className={cx(
            'max-w-full min-w-0 text-xl font-semibold tracking-widest uppercase focus:outline-none',
            wrapping ? 'wrap-break-word' : 'truncate'
          )}
        >
          {name ?? t('common.unknown')}
        </h1>
        {aside}
      </div>
      <p
        className={cx(
          'flex min-w-0 text-xs text-text-dim',
          wrapping ? 'flex-wrap' : 'whitespace-nowrap'
        )}
      >
        {publicInfo?.corporationName && publicInfo.corporationId !== undefined ? (
          <CorporationLink id={publicInfo.corporationId} className={linkClassName}>
            {publicInfo.corporationName}
          </CorporationLink>
        ) : (
          <span className={wrapping ? undefined : 'min-w-0 truncate'}>
            {publicInfo?.corporationName ?? t('common.unknown')}
          </span>
        )}
        {publicInfo?.allianceName && (
          <>
            <span className="shrink-0 whitespace-pre">{wrapping ? ' · ' : ' / '}</span>
            {publicInfo.allianceId !== undefined ? (
              <AllianceLink id={publicInfo.allianceId} className={linkClassName}>
                {publicInfo.allianceName}
              </AllianceLink>
            ) : (
              <span className={wrapping ? undefined : 'min-w-0 truncate'}>
                {publicInfo.allianceName}
              </span>
            )}
          </>
        )}
      </p>
      <CharacterAchievementLine characterId={characterId} />
    </>
  );
}
