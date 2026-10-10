import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './DropdownMenu';
import * as Icon from './icons';
import type { PageViews } from './viewPicker';

interface PageViewPickerProps extends PageViews {
  /** Already-translated page name. */
  title: string;
}

/**
 * The phone's stand-in for a 4+ tab strip: the page title with the current
 * view and a chevron, opening a list of every view. It is the page's `<h1>`
 * content (see `PageHeader`), so it reads as navigation, not as a form field.
 */
export function PageViewPicker({ title, tabs, value, onChange }: PageViewPickerProps) {
  const { t } = useTranslation();
  const current = tabs.find((tab) => tab.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('common.viewPicker.label', { page: title, view: current?.label ?? '' })}
        className="-mx-1 flex min-h-11 max-w-full min-w-0 cursor-pointer items-center gap-2 rounded px-1 text-left uppercase focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="max-w-full shrink-0 truncate">{title}</span>
        {current && (
          <span className="max-w-full shrink-0 truncate text-base font-normal tracking-normal text-text-dim normal-case">
            {current.label}
          </span>
        )}
        <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {tabs.map((tab) => (
            <DropdownMenuRadioItem key={tab.id} value={tab.id}>
              {tab.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
