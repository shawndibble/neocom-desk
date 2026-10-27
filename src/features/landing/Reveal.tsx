import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { canAnimate } from './motion';

/**
 * Fades and slides its children in the first time they scroll into view.
 *
 * Content is visible by default. Only once an effect has confirmed the element
 * sits below the fold (and motion is allowed and IntersectionObserver exists)
 * does it get `data-reveal="hidden"`; the observer then flips it to `shown`
 * once. Above-the-fold elements are never hidden, so they cannot flash. The
 * transition itself lives in `index.css` behind `prefers-reduced-motion`.
 * `index` staggers siblings through the `--lp-delay` custom property.
 */
export function Reveal({
  as: Tag = 'div',
  index = 0,
  className,
  children,
}: {
  as?: ElementType;
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !canAnimate()) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.reveal = 'hidden';
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        el.dataset.reveal = 'shown';
        observer.disconnect();
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cx('lp-reveal', className)}
      style={{ '--lp-delay': `${Math.min(index, 6) * 80}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
