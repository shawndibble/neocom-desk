import { useTranslation } from 'react-i18next';
import { ShareMark } from '@/components/ui';
import type { PopShareMark } from '@/engine/corpTaxBook/popShareMarks';
import { popShareMarkLabel } from '../taxBook/popShareMarkLabel';

/**
 * A moon's (or moon owner's) Pop Sharing mark (issue #6226): the share mark naming its
 * audiences, the slashed mark when the moon owner opted out, nothing when unshared. `to` links
 * a shared mark to where its sharing is set.
 */
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
