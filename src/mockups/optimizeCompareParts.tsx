import { useState } from 'react';
import { Button, Eyebrow, Modal, SegmentedControl } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { Ascending, Descending } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  CURRENT_ROWS,
  MOVED_COUNT,
  PROPOSED_ROWS,
  SAVED,
  TOTAL_AFTER,
  TOTAL_BEFORE,
  newPositionOf,
  type CompareRow,
} from './optimizeCompareFixtures';

type Side = 'current' | 'proposed';

function MovePill({ from, position }: { from: number; position: number }) {
  const up = position < from;
  const Icon = up ? Ascending : Descending;
  return (
    <Pill tone="warning" className="inline-flex shrink-0 items-center gap-0.5">
      <Icon aria-hidden size={10} />
      {Math.abs(from - position)}
    </Pill>
  );
}

/** One list: the plan as it is, or as the optimizer would leave it. */
export function CompareList({ side, rows }: { side: Side; rows: readonly CompareRow[] }) {
  return (
    <ol className="space-y-0.5 text-xs">
      {rows.map((row, i) => {
        if (row.kind === 'remap') {
          return (
            <li
              key={`remap-${i}`}
              className="my-1 rounded-xs border border-dashed border-accent bg-accent/10 px-2 py-1 text-accent"
            >
              <span className="font-semibold">New remap marker.</span> {row.text}
            </li>
          );
        }
        const to = newPositionOf(row.step.name);
        const moved = side === 'current' ? to !== row.position : row.step.from !== row.position;
        return (
          <li
            key={row.step.name}
            className={cx(
              'flex items-center gap-2 rounded-xs px-2 py-1',
              moved && 'bg-warning/10',
              !moved && 'border-b border-line'
            )}
          >
            <span className="w-5 shrink-0 tabular-nums text-text-dim">{row.position}</span>
            <span className={cx('min-w-0 flex-1 truncate', moved && 'font-semibold')}>
              {row.step.name}
            </span>
            {moved && side === 'proposed' && (
              <MovePill from={row.step.from} position={row.position} />
            )}
            {moved && side === 'current' && (
              <span className="shrink-0 text-text-dim">moves to {to}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Summary() {
  return (
    <p className="text-xs">
      <span className="font-semibold text-success">
        Total {TOTAL_BEFORE} → {TOTAL_AFTER}
      </span>
      <span className="text-text-dim">
        {' '}
        · saves {SAVED} · {MOVED_COUNT} skills move · 2 remap markers added
      </span>
    </p>
  );
}

function Actions() {
  return (
    <div className="flex gap-2">
      <Button variant="primary" size="sm">
        Accept
      </Button>
      <Button size="sm">Reject</Button>
    </div>
  );
}

/** Proposed: the Modal widens and shows Current and Optimized columns together. */
export function CompareModalMockup() {
  const [side, setSide] = useState<Side>('proposed');
  return (
    <Modal
      open
      onClose={() => undefined}
      title="Optimize for me"
      placement="wide"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Summary />
          <Actions />
        </div>
      }
    >
      <div className="space-y-2">
        <div className="md:hidden">
          <SegmentedControl
            label="Plan to show"
            fill
            value={side}
            onChange={setSide}
            options={[
              { value: 'current', label: 'Current' },
              { value: 'proposed', label: 'Optimized' },
            ]}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <section className={cx('space-y-1', side !== 'current' && 'max-md:hidden')}>
            <Eyebrow>Current · {TOTAL_BEFORE}</Eyebrow>
            <CompareList side="current" rows={CURRENT_ROWS} />
          </section>
          <section className={cx('space-y-1', side !== 'proposed' && 'max-md:hidden')}>
            <Eyebrow>Optimized · {TOTAL_AFTER}</Eyebrow>
            <CompareList side="proposed" rows={PROPOSED_ROWS} />
          </section>
        </div>
      </div>
    </Modal>
  );
}
