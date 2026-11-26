import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SlideOver } from '@/components/ui/SlideOver';

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
