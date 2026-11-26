import { useState } from 'react';
import { useIsNarrow } from '@/lib/useIsNarrow';

export function usePhoneFold() {
  const phone = useIsNarrow();
  const [open, setOpen] = useState(false);
  return { phone, expanded: !phone || open, toggle: () => setOpen((value) => !value) };
}
