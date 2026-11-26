import type { PopAudience } from '../../../../functions/src/popSharing';
import type { PopShareMark } from '@/engine/corpTaxBook/popShareMarks';
import type { Translate } from '@/lib/translate';

const k = 'corpTaxBook.moons.sharing';

export const popAudienceName = (t: Translate, a: PopAudience): string =>
  a.kind === 'community' ? a.name : t(`${k}.audience.${a.kind}`);

export function popShareMarkLabel(t: Translate, mark: PopShareMark): string {
  if (mark.kind === 'opted-out') return t(`${k}.ownerOptedOut`);
  return t(`${k}.mark.shared`, {
    audiences: mark.audiences.map((a) => popAudienceName(t, a)).join(', '),
  });
}
