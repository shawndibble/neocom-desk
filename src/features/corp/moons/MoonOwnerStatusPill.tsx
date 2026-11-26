import { useTranslation } from 'react-i18next';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { MoonOwnerStatus } from '@/engine/corpTaxBook/moonOwners';

const STATUS_TONE: Record<MoonOwnerStatus, PillTone> = {
  active: 'success',
  'cant-read': 'warning',
  'removal-pending': 'danger',
  'removal-unsent': 'danger',
  'settled-otherwise': 'neutral',
  'rate-asked': 'warning',
  'no-rate': 'neutral',
  disconnected: 'danger',
  left: 'neutral',
  removed: 'neutral',
};

const k = (key: string) => `corpTaxBook.moons.moonOwners.${key}`;

export function MoonOwnerStatusPill({ status }: { status: MoonOwnerStatus }) {
  const { t } = useTranslation();
  return <Pill tone={STATUS_TONE[status]}>{t(k(`status.${status}`))}</Pill>;
}
