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
};

/** One corporation's state as a word on a tint. */
export function CorpStatePill({ state }: { state: CorpState }) {
  const { t } = useTranslation();
  return (
    <Pill tone={STATE_TONE[state]}>{t(`corpTaxBook.moons.addCorps.signIn.state.${state}`)}</Pill>
  );
}

/** A corporation and its CEO on one line, with whatever sits at the right. Used by the picker, the hidden list and the sign-in list. */
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
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-3 py-2">
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-text-dim">
          {t('corpTaxBook.moons.addCorps.pick.ceo', { name: ceoName })}
        </p>
      </div>
      {trailing}
    </li>
  );
}
