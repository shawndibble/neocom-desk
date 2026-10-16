import { forwardRef, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@/components/ui';
import { useOnline } from '@/stores/network';

/**
 * A Button for something that writes to the Communities backend, which needs a
 * connection. Offline it reports `aria-disabled` (so it stays focusable and its
 * tooltip can say why, DESIGN.md §6c) and ignores the click; online it is a
 * plain Button. Every other prop passes through.
 */
export const NeedsConnectionButton = forwardRef<HTMLButtonElement, ComponentProps<typeof Button>>(
  function NeedsConnectionButton({ onClick, ...rest }, ref) {
    const { t } = useTranslation();
    const online = useOnline();
    if (online) return <Button ref={ref} onClick={onClick} {...rest} />;
    return (
      <Tooltip content={t('common.needsConnection')}>
        <Button ref={ref} {...rest} aria-disabled="true" />
      </Tooltip>
    );
  }
);
