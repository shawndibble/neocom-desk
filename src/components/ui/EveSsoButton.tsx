import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { NeedsConnection } from './NeedsConnection';
import { Spinner } from './Spinner';
import { disabledClassName, focusRingClassName, interactiveClassName } from './controlStyles';

const SIZES = {
  large: {
    src: '/brand/eve-sso-login-black-large.png',
    src2x: '/brand/eve-sso-login-black-large@2x.png',
    width: 270,
    height: 45,
  },
  small: {
    src: '/brand/eve-sso-login-black-small.png',
    src2x: '/brand/eve-sso-login-black-small@2x.png',
    width: 195,
    height: 30,
  },
} as const;

export function EveSsoButton({
  size,
  label,
  pending,
  onClick,
}: {
  size: keyof typeof SIZES;
  label: string;
  pending: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const { src, src2x, width, height } = SIZES[size];
  return (
    <NeedsConnection>
      <button
        type="button"
        onClick={pending ? undefined : onClick}
        aria-disabled={pending || undefined}
        className={cx(
          'relative inline-block rounded-xs',
          size === 'small' && 'touch:inline-flex touch:min-h-9 touch:items-center',
          interactiveClassName,
          focusRingClassName,
          disabledClassName
        )}
      >
        <img
          src={src}
          srcSet={`${src} 1x, ${src2x} 2x`}
          alt={label}
          width={width}
          height={height}
          className="block"
        />
        {pending && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner size="sm" label={t('common.loading')} />
          </span>
        )}
      </button>
    </NeedsConnection>
  );
}
