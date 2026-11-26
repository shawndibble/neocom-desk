import { useEffect, useRef, type RefObject } from 'react';

export function useFocusHeading(
  ref: RefObject<HTMLElement | null>,
  key: unknown,
  enabled = true
): void {
  const prevKey = useRef(key);
  useEffect(() => {
    if (enabled && prevKey.current !== key && key !== null) {
      ref.current?.focus();
    }
    prevKey.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref is a stable identity from the caller's own useRef; only key/enabled should retrigger this
  }, [key, enabled]);
}
