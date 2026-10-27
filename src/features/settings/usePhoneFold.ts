import { useState } from 'react';
import { useIsNarrow } from '@/lib/useIsNarrow';

/**
 * A Settings block that folds on a phone (below `md`) and is always open above
 * it: the phone's height budget (issue #4562) costs desktop nothing. `phone`
 * says whether the fold applies at all; `expanded` is what to render.
 */
export function usePhoneFold() {
  const phone = useIsNarrow();
  const [open, setOpen] = useState(false);
  return { phone, expanded: !phone || open, toggle: () => setOpen((value) => !value) };
}
