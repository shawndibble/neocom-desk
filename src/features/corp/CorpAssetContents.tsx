/**
 * What one Corp assets location row holds, nested the way the in-game hangar
 * shows it: containers (and ships) open to their contents, loose stacks list
 * beside them. The by-location view's caret unfolds it under the row.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import type { AssetNameMap } from '@/engine/assetNames';
import type { LedgerContentsNode } from '@/engine/corp/assetLedger';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';
import type { LedgerLabels } from './assetLedgerView';

/** Per-level step, as `MarketGroupTree` indents. */
const INDENT_REM = 0.75;

function NodeName({
  node,
  labels,
  assetNames,
}: {
  node: LedgerContentsNode;
  labels: LedgerLabels;
  assetNames: AssetNameMap;
}) {
  const typeName = labels.typeName(node.typeId);
  const gameName = assetNames[node.itemId];
  const quantity = node.stack?.quantity ?? 1;
  return (
    <span className="min-w-0 truncate">
      {gameName ?? typeName}
      {gameName !== undefined && <span className="text-text-dim"> · {typeName}</span>}
      {quantity > 1 && (
        <span className="text-text-dim tabular-nums"> ×{formatCount(quantity)}</span>
      )}
    </span>
  );
}

function ContentsNode({
  node,
  depth,
  labels,
  assetNames,
}: {
  node: LedgerContentsNode;
  depth: number;
  labels: LedgerLabels;
  assetNames: AssetNameMap;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isContainer = node.children.length > 0;
  const rowClass = 'flex w-full items-center gap-2 py-1 pr-3 text-left text-sm';
  const indent = { paddingLeft: `${0.75 + depth * INDENT_REM}rem` };
  const value = (
    <span className="ml-auto shrink-0 text-xs text-text-dim tabular-nums">
      {isContainer
        ? t('corp.assets.groupTotals', {
            count: node.itemCount,
            value: formatIsk(node.estimatedValue),
          })
        : node.estimatedValue === 0
          ? '—'
          : t('corp.assets.stackValue', { value: formatIsk(node.estimatedValue) })}
    </span>
  );

  if (!isContainer) {
    return (
      <li className={rowClass} style={indent}>
        <span className="w-4 shrink-0" aria-hidden="true" />
        <NodeName node={node} labels={labels} assetNames={assetNames} />
        {value}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className={cx(rowClass, rowInteractiveClassName, focusRingInsetClassName)}
        style={indent}
      >
        <span className="flex w-4 shrink-0 justify-center">
          <Caret expanded={expanded} />
        </span>
        <NodeName node={node} labels={labels} assetNames={assetNames} />
        {value}
      </button>
      {expanded && (
        <ContentsList
          nodes={node.children}
          depth={depth + 1}
          labels={labels}
          assetNames={assetNames}
        />
      )}
    </li>
  );
}

function ContentsList({
  nodes,
  depth,
  labels,
  assetNames,
}: {
  nodes: readonly LedgerContentsNode[];
  depth: number;
  labels: LedgerLabels;
  assetNames: AssetNameMap;
}) {
  return (
    <ul>
      {nodes.map((node) => (
        <ContentsNode
          key={node.itemId}
          node={node}
          depth={depth}
          labels={labels}
          assetNames={assetNames}
        />
      ))}
    </ul>
  );
}

export function CorpAssetContents({
  nodes,
  labels,
  assetNames,
}: {
  nodes: readonly LedgerContentsNode[];
  labels: LedgerLabels;
  assetNames: AssetNameMap;
}) {
  return <ContentsList nodes={nodes} depth={0} labels={labels} assetNames={assetNames} />;
}
