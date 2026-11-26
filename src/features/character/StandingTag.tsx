import { useTranslation } from 'react-i18next';
import { StandingIcon } from '@/components/ui/StandingIcon';
import type { EffectiveStanding } from './contactStandings';
import { standingLabel } from './standingLabel';

interface StandingTagProps {
  standing: EffectiveStanding | null;
  className?: string;
}

export function StandingTag({ standing, className }: StandingTagProps) {
  const { t } = useTranslation();
  const label = standingLabel(t, standing);
  if (standing === null || label === null) return null;
  return <StandingIcon value={standing.standing} label={label} className={className} />;
}
