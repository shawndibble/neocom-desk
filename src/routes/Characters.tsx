import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { characterPortraitUrl } from '@/app/images';
import { usePublicInfo } from '@/stores/publicInfo';
import { useActiveCharacter } from '@/stores/activeCharacter';

/** Character list: pick the active character or add another via EVE SSO. */
export function Characters() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const characters = useLiveQuery(() => db.characters.orderBy('characterId').toArray());
  const publicInfo = usePublicInfo((state) => state.byCharacterId);
  const loadPublicInfo = usePublicInfo((state) => state.load);
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);

  useEffect(() => {
    characters?.forEach((character) => void loadPublicInfo(character.characterId));
  }, [characters, loadPublicInfo]);

  async function select(characterId: number) {
    await setActiveCharacter(characterId);
    navigate('/overview');
  }

  if (!characters) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('characters.title')}</h1>
        <Button variant="primary" size="sm" onClick={() => void beginEveLogin()}>
          {t('characters.add')}
        </Button>
      </header>

      {characters.length === 0 ? (
        <EmptyState title={t('characters.emptyTitle')} hint={t('characters.emptyHint')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {characters.map((character) => {
            const info = publicInfo[character.characterId];
            return (
              <li key={character.characterId}>
                <button
                  type="button"
                  aria-label={t('characters.select', { name: character.name })}
                  onClick={() => void select(character.characterId)}
                  className="flex w-full items-center gap-3 rounded-xs border border-line bg-panel/85 p-3 text-left backdrop-blur-sm transition-colors hover:border-line-bright hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <img
                    src={characterPortraitUrl(character.characterId)}
                    alt={t('characters.portraitAlt', { name: character.name })}
                    width={64}
                    height={64}
                    loading="lazy"
                    className="size-16 shrink-0 rounded-xs border border-line"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{character.name}</span>
                    <span className="block truncate text-xs text-text-dim">
                      {info?.corporationName ?? t('common.unknown')}
                    </span>
                    <span className="block truncate text-xs text-text-faint">
                      {info?.allianceName ?? t('common.unknown')}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
