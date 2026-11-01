import { useTranslation } from 'react-i18next';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { MoonOwnerStatus } from '@/engine/corpTaxBook/moonOwners';

const STATUS_TONE: Record<MoonOwnerStatus, PillTone> = {
  active: 'success',
  'cant-read': 'warning',
  'removal-pending': 'danger',
  'settled-otherwise': 'neutral',
  'no-rate': 'neutral',
  disconnected: 'danger',
  left: 'neutral',
  removed: 'neutral',
};

const k = (key: string) => `corpTaxBook.moons.moonOwners.${key}`;

/** A moon owner's status as a word on a tint (readable without the colour). */
export function MoonOwnerStatusPill({ status }: { status: MoonOwnerStatus }) {
  const { t } = useTranslation();
  return <Pill tone={STATUS_TONE[status]}>{t(k(`status.${status}`))}</Pill>;
}
