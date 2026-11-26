import { useTranslation } from 'react-i18next';
import { ShareMark } from '@/components/ui';
import type { PopShareMark } from '@/engine/corpTaxBook/popShareMarks';
import { popShareMarkLabel } from '../taxBook/popShareMarkLabel';

export function PopShareIcon({ mark, to }: { mark: PopShareMark | null | undefined; to?: string }) {
  const { t } = useTranslation();
  if (!mark) return null;
  return (
    <ShareMark
      label={popShareMarkLabel(t, mark)}
      off={mark.kind === 'opted-out'}
      {...(to && mark.kind === 'shared' ? { to } : {})}
    />
  );
}
