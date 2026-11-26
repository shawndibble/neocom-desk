import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, LiveStatus, Spinner } from '@/components/ui';
import type { SkilledAttributesState } from '@/features/fittings/useSkilledAttributes';

export function SkilledValuesNote({
  state,
  changed,
}: {
  state: SkilledAttributesState;
  changed: boolean;
}) {
  const { t } = useTranslation();
  const [asked, setAsked] = useState(false);
  if (state.status === 'ready') {
    if (!changed) return null;
    return <p className="text-xs text-text-dim">{t('market.itemDetail.skilled.note')}</p>;
  }
  if (state.status === 'loading' && asked) {
    return (
      <p className="flex items-center gap-2 text-xs text-text-dim">
        <LiveStatus>{t('market.itemDetail.skilled.loading')}</LiveStatus>
        <Spinner size="sm" />
        {t('market.itemDetail.skilled.loading')}
      </p>
    );
  }
  if (state.status !== 'needs-download') return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-dim">
      <span>{t('market.itemDetail.skilled.offer')}</span>
      <Button
        size="sm"
        onClick={() => {
          setAsked(true);
          state.load();
        }}
      >
        {t('market.itemDetail.skilled.load')}
      </Button>
    </div>
  );
}
