import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SlideOver } from '@/components/ui/SlideOver';

/**
 * The PI tabs' drawer: a right-hand slide-over beside a pointer, a bottom sheet
 * (grabber, swipe down, scrim, Back, Escape) on a phone. Both close on Escape
 * and Back, move focus in on open, and hand it back to what held it then.
 * `returnFocusFallback` is for a drawer a link on another tab opened: that
 * link is gone, so focus goes there instead of to the page body.
 *
 * `closeOnBack={false}` for a drawer the URL already backs (the product
 * drawer's `?product=`): Back pops that entry, and the drawer closes because
 * the param is gone, so it must not push one of its own as well.
 */
export function PiDrawer(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  phone: boolean;
  closeOnBack?: boolean;
  returnFocusFallback?: () => HTMLElement | null;
  children: ReactNode;
}) {
  if (props.phone) {
    return (
      <Modal
        open={props.open}
        onClose={props.onClose}
        title={props.title}
        placement="sheet"
        closeOnBack={props.closeOnBack}
        returnFocusFallback={props.returnFocusFallback}
      >
        {props.children}
      </Modal>
    );
  }
  return (
    <SlideOver
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      closeOnBack={props.closeOnBack}
      returnFocusFallback={props.returnFocusFallback}
    >
      {props.children}
    </SlideOver>
  );
}
