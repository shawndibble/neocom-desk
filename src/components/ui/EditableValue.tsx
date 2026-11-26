import {
  useCallback,
  useEffect,
  useRef,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as Icon from '@/components/ui/icons';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

const SEED_KEY = /^[0-9.,]$/;

const editableValueClassName = cx(
  'inline-flex min-h-9 items-center gap-1 rounded-xs border border-transparent px-1 tabular-nums hover:border-line-bright hover:bg-panel-2 md:min-h-0',
  interactiveClassName,
  focusRingClassName
);

type EditableValueProps = Omit<
  ComponentPropsWithRef<'button'>,
  'children' | 'onClick' | 'onKeyDown' | 'type' | 'aria-label' | 'aria-labelledby'
> & {
  children: ReactNode;
  label: string;
  onEdit: (seed?: string) => void;
  focusOnMount?: boolean;
  onFocused?: () => void;
};

export function EditableValue({
  children,
  label,
  onEdit,
  className,
  focusOnMount = false,
  onFocused,
  ref,
  ...rest
}: EditableValueProps) {
  const ownRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!focusOnMount) return;
    ownRef.current?.focus();
    onFocused?.();
  }, [focusOnMount, onFocused]);
  const setRef = useCallback(
    (node: HTMLButtonElement | null) => {
      ownRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || !SEED_KEY.test(event.key)) return;
    event.preventDefault();
    onEdit(event.key);
  }
  return (
    <button
      {...rest}
      ref={setRef}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onEdit();
      }}
      onKeyDown={onKeyDown}
      className={cx(editableValueClassName, className)}
    >
      <span className="sr-only">{label}, </span>
      {children}
      <Icon.Rename size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-text-faint" />
    </button>
  );
}
