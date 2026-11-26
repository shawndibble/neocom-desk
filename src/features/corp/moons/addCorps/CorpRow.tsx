import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { CorpState } from './addCorpsStatus';

const STATE_TONE: Record<CorpState, PillTone> = {
  ready: 'neutral',
  connected: 'success',
  'needs-sign-in': 'warning',
  'needs-role': 'warning',
  'own-book': 'warning',
  'gone-quiet': 'danger',
  failed: 'danger',
  'needs-names': 'warning',
  'names-not-shared': 'neutral',
  'needs-ore': 'warning',
};

export function CorpStatePill({ state }: { state: CorpState }) {
  const { t } = useTranslation();
  return (
    <Pill tone={STATE_TONE[state]}>{t(`corpTaxBook.moons.addCorps.signIn.state.${state}`)}</Pill>
  );
}

export function CorpCeo({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <span className="block max-w-full truncate text-xs text-text-dim">
      {t('corpTaxBook.moons.addCorps.pick.ceo', { name })}
    </span>
  );
}

export function CorpRow({
  name,
  ceoName,
  leading,
  trailing,
}: {
  name: string;
  ceoName: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <CorpCeo name={ceoName} />
      </div>
      {trailing}
    </li>
  );
}
