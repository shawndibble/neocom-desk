import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { Spinner } from './Spinner';
import { disabledClassName, focusRingClassName, interactiveClassName } from './controlStyles';

/**
 * CCP's own "Log in with EVE Online" button, the artwork their SSO docs ask
 * third-party apps to use so players see one familiar button everywhere. The
 * PNGs are self-hosted under `public/brand/` (offline PWA, no third-party
 * request on the login page); the label is baked into the image, so `label`
 * is only the accessible name.
 */
const SIZES = {
  large: { src: '/brand/eve-sso-login-black-large.png', width: 270, height: 45 },
  small: { src: '/brand/eve-sso-login-black-small.png', width: 195, height: 30 },
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
  const { src, width, height } = SIZES[size];
  return (
    <button
      type="button"
      // aria-disabled, not disabled: the press that starts the login keeps focus (DESIGN.md §6c).
      onClick={pending ? undefined : onClick}
      aria-disabled={pending || undefined}
      className={cx(
        'relative inline-block rounded-xs',
        // The small artwork is 30px tall; a touch screen still gets a 44px hit area.
        size === 'small' && 'touch:inline-flex touch:min-h-11 touch:items-center',
        interactiveClassName,
        focusRingClassName,
        disabledClassName
      )}
    >
      <img src={src} alt={label} width={width} height={height} className="block" />
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" label={t('common.loading')} />
        </span>
      )}
    </button>
  );
}
