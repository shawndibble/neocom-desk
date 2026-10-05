import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SlideOver } from '@/components/ui/SlideOver';

/**
 * The PI tabs' drawer: a right-hand slide-over beside a pointer, a bottom sheet
 * (grabber, swipe down, scrim, Back, Escape) on a phone. Both close on Escape
 * and Back and move focus in on open; a slide-over has no trigger of its own to
 * hand focus back to, so the caller restores it (see `useReturnFocus`).
 */
export function PiDrawer(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  phone: boolean;
  children: ReactNode;
}) {
  if (props.phone) {
    return (
      <Modal open={props.open} onClose={props.onClose} title={props.title} placement="sheet">
        {props.children}
      </Modal>
    );
  }
  return (
    <SlideOver open={props.open} onClose={props.onClose} title={props.title}>
      {props.children}
    </SlideOver>
  );
}
