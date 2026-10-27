import { useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import { useFocusAfterCommit } from './useFocusAfterCommit';

export interface InPlaceEditOptions {
  /** The text the field opens with, and what an unchanged draft is compared to. */
  initial: () => string;
  /**
   * Saves a changed draft (Enter or blur). A rejection reopens the field with the
   * draft kept and sets `failure`, so a refusal never costs what was typed.
   */
  onCommit: (draft: string) => void | Promise<void>;
  /** Opens already editing: the field is mounted only while editing. */
  open?: boolean;
  /** After the field closes, saved or not: for a parent that owns whether it is shown. */
  onClose?: () => void;
}

export interface InPlaceEdit<T extends HTMLElement> {
  editing: boolean;
  start: () => void;
  /** The control that opens the edit: Enter and Escape hand focus back to it. */
  triggerRef: RefObject<T | null>;
  /** The last rejected save, until the next start. */
  failure: unknown;
  /** Spread onto the text input. */
  inputProps: {
    autoFocus: true;
    value: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onBlur: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  };
}

/**
 * A name edited in place (§6c): Enter or blur saves a changed draft, Escape
 * cancels; Enter and Escape hand focus back to the trigger, blur does not (the
 * user is already moving on). An Enter that confirms an IME candidate is not a save.
 */
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
  // Set once Enter or Esc has settled the field, so the blur that follows does not save again.
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
          // Focus moves to a button mid-keystroke: its keypress must not click it.
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
