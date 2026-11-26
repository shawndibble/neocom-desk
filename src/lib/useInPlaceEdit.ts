import { useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import { useFocusAfterCommit } from './useFocusAfterCommit';

export interface InPlaceEditOptions {
  initial: () => string;
  onCommit: (draft: string) => void | Promise<void>;
  open?: boolean;
  onClose?: () => void;
}

export interface InPlaceEdit<T extends HTMLElement> {
  editing: boolean;
  start: () => void;
  triggerRef: RefObject<T | null>;
  failure: unknown;
  inputProps: {
    autoFocus: true;
    value: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onBlur: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  };
}

export function useInPlaceEdit<T extends HTMLElement = HTMLButtonElement>({
  initial,
  onCommit,
  open = false,
  onClose,
}: InPlaceEditOptions): InPlaceEdit<T> {
  const [editing, setEditing] = useState(open);
  const [draft, setDraft] = useState(() => (open ? initial() : ''));
  const [failure, setFailure] = useState<unknown>(undefined);
  const triggerRef = useRef<T>(null);
  const settled = useRef(false);
  const focusAfterCommit = useFocusAfterCommit();

  function start() {
    settled.current = false;
    setFailure(undefined);
    setDraft(initial());
    setEditing(true);
  }

  function close(save: boolean, refocus: boolean) {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);
    if (refocus) focusAfterCommit(triggerRef);
    onClose?.();
    if (!save || draft.trim() === initial().trim()) return;
    const kept = draft;
    const reopen = (e: unknown) => {
      setFailure(e);
      settled.current = false;
      setDraft(kept);
      setEditing(true);
    };
    try {
      onCommit(kept)?.catch(reopen);
    } catch (e) {
      reopen(e);
    }
  }

  return {
    editing,
    start,
    triggerRef,
    failure,
    inputProps: {
      autoFocus: true,
      value: draft,
      onChange: (e) => setDraft(e.target.value),
      onBlur: () => close(true, false),
      onKeyDown: (e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          close(true, true);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close(false, true);
        }
      },
    },
  };
}
