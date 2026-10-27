/** Issue #5330 mockup pieces: event rows with a grant icon and greyed-out channel columns. */
import type { ReactNode } from 'react';
import { Button, Caret, Checkbox, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  ChannelColumnHeadings,
  EVENT_ROW_GRID,
  DEVICE_CELL,
  ALERTS_CELL,
} from '@/features/notifications/ChannelColumns';
import { NewComponent } from './NewComponent';

/** `ok`: grant in place. `missing`: needs a grant the Character lacks. `none`: nothing arrives closed. */
export type GrantBadge = 'ok' | 'missing' | 'none';

export interface ChannelState {
  /** Why the column is off; undefined when it is usable. */
  offReason?: string;
}

export interface MockRowProps {
  label: string;
  badge: GrantBadge;
  device: boolean;
  alerts: boolean;
  deviceOff?: string;
  alertsOff?: string;
  missingStep?: string;
}

const OK_TIP = 'Arrives even with the app closed. Needs notification permission.';

/** The proposed icon: the Broadcast mark in `danger`, with a slash so colour is never the only signal. */
function MissingGrantBadge({ step }: { step: string }) {
  return (
    <Tooltip content={step} openOnTap>
      <span role="img" aria-label={step} className="relative shrink-0 text-danger">
        <Icon.ScheduledPush size={Icon.ICON_SIZE.sm} />
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        >
          <path d="M2 14 L14 2" />
        </svg>
      </span>
    </Tooltip>
  );
}

function OkBadge() {
  return (
    <Tooltip content={OK_TIP} openOnTap>
      <span role="img" aria-label={OK_TIP} className="shrink-0 text-accent">
        <Icon.ScheduledPush size={Icon.ICON_SIZE.sm} />
      </span>
    </Tooltip>
  );
}

function Cell({
  className,
  caption,
  checked,
  off,
  label,
}: {
  className: string;
  caption: string;
  checked: boolean;
  off?: string;
  label: string;
}) {
  const box = (
    <label
      className={cx(
        'inline-flex min-h-9 items-center gap-1.5 md:min-h-0',
        off ? 'cursor-not-allowed' : 'cursor-pointer'
      )}
    >
      <Checkbox
        checked={checked}
        disabled={off !== undefined}
        onChange={() => {}}
        aria-label={label}
      />
      <span className={cx('text-text-dim md:hidden', off && 'opacity-60')}>{caption}</span>
    </label>
  );
  return (
    <div className={className}>
      {off ? (
        <Tooltip content={off} openOnTap>
          {/* A disabled input swallows pointer events, so the tooltip sits on its wrapper. */}
          <span className="inline-flex">{box}</span>
        </Tooltip>
      ) : (
        box
      )}
    </div>
  );
}

export function MockRow({
  label,
  badge,
  device,
  alerts,
  deviceOff,
  alertsOff,
  missingStep = 'Needs Alerts when closed. Turn it on in Manage Alerts when closed.',
}: MockRowProps) {
  return (
    <li>
      <div className={cx('px-3 text-xs hover:bg-panel-2', EVENT_ROW_GRID)}>
        <div className="flex min-w-0 items-start gap-1.5 md:col-start-1 md:row-start-1">
          <span className="flex min-h-9 min-w-0 items-center gap-1.5 py-2 text-text">
            <Caret expanded={false} />
            <span className="min-w-0 break-words">{label}</span>
          </span>
          {badge !== 'none' && (
            <span className="py-3 md:py-2">
              {badge === 'ok' ? <OkBadge /> : <MissingGrantBadge step={missingStep} />}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 pl-6 md:contents">
          <Cell
            className={DEVICE_CELL}
            caption="Device"
            checked={device}
            off={deviceOff}
            label={`${label}: Device`}
          />
          <Cell
            className={ALERTS_CELL}
            caption="Alerts"
            checked={alerts}
            off={alertsOff}
            label={`${label}: Alerts`}
          />
        </div>
      </div>
    </li>
  );
}

/** The Delivery section's two toggles, as the real one lays them out. */
export function DeliveryStrip({
  deviceOn,
  alertsOn,
  permission,
}: {
  deviceOn: boolean;
  alertsOn: boolean;
  permission: 'granted' | 'default';
}) {
  return (
    <div className="space-y-2 pb-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-text">
        <label className="inline-flex items-center gap-1.5">
          <Checkbox checked={deviceOn} onChange={() => {}} /> Device notifications
        </label>
        <label className="inline-flex items-center gap-1.5">
          <Checkbox checked={alertsOn} onChange={() => {}} /> Alerts list
        </label>
      </div>
      {permission === 'default' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-text-dim">
            This device hasn&apos;t granted notification permission yet.
          </p>
          <Button size="sm" variant="primary">
            Turn on device notifications
          </Button>
        </div>
      )}
    </div>
  );
}

export const DEVICE_PERMISSION_OFF =
  'This device hasn’t granted notification permission yet. Use Turn on device notifications above.';
export const DEVICE_TOGGLE_OFF = 'Device notifications are off. Turn them on above.';
export const ALERTS_TOGGLE_OFF = 'The Alerts list is off. Turn it on above.';

export function RowTable({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xs border border-line bg-panel">
      <ChannelColumnHeadings />
      <ul className="divide-y divide-line">{children}</ul>
    </div>
  );
}

/** The opened event: one chip per Character with its D and A boxes. */
export function MockChips({ deviceOff, alertsOff }: { deviceOff?: string; alertsOff?: string }) {
  const names = ['Aria Vance', 'Brun Kessel', 'Cato Ferrin'];
  return (
    <div className="space-y-1.5 border-t border-line bg-panel-2 px-3 py-3">
      <p className="text-[0.6875rem] text-text-dim">D = Device, A = Alerts</p>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {names.map((name, index) => (
          <li
            key={name}
            className="flex items-center gap-2 rounded-xs border border-line bg-panel px-2 py-1 text-xs"
          >
            <span className="min-w-0 flex-1 truncate text-text">{name}</span>
            {[
              { letter: 'D', off: deviceOff, checked: index !== 2 },
              { letter: 'A', off: alertsOff, checked: true },
            ].map(({ letter, off, checked }) => {
              const box = (
                <label className="inline-flex items-center gap-1">
                  <Checkbox
                    checked={checked}
                    disabled={off !== undefined}
                    onChange={() => {}}
                    aria-label={`${name}: ${letter}`}
                  />
                  <span className="text-text-dim">{letter}</span>
                </label>
              );
              return off ? (
                <Tooltip key={letter} content={off} openOnTap>
                  <span className="inline-flex">{box}</span>
                </Tooltip>
              ) : (
                <span key={letter}>{box}</span>
              );
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs text-text-dim">{children}</p>;
}

export function MissingGrantNew({ children }: { children: ReactNode }) {
  return <NewComponent name="MissingGrantBadge">{children}</NewComponent>;
}
