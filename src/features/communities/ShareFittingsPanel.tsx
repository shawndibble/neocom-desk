import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { collectFittingsToShare } from './shareAllFittings';
import { shareFittings, unshareAllFittings } from './sharedFittings';

/**
 * One Community's Fittings controls (issue #3605): a one-time "share all my
 * Fittings" and its undo. Not a standing setting — a Fitting saved later is
 * shared only if the Member shares it, from its own menu.
 */
export function ShareFittingsPanel({
  characterId,
  communityId,
}: {
  characterId: number;
  communityId: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await action());
    } catch {
      setNotice(t('communities.fittings.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 space-y-2" aria-label={t('communities.fittings.title')}>
      <h3 className="text-xs font-semibold">{t('communities.fittings.title')}</h3>
      <p className="text-xs text-text-dim">{t('communities.fittings.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const count = await shareFittings(
                characterId,
                communityId,
                await collectFittingsToShare(characterId)
              );
              return t('communities.fittings.shared', { count });
            })
          }
        >
          {t('communities.fittings.shareAll')}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await unshareAllFittings(characterId, communityId);
              return t('communities.fittings.unshared');
            })
          }
        >
          {t('communities.fittings.unshareAll')}
        </Button>
        {notice !== null && (
          <span role="status" className="text-xs text-text-dim">
            {notice}
          </span>
        )}
      </div>
    </section>
  );
}
