/**
 * One class on the map: its uppercase label over a double rule, the ISIS
 * class icon (dim while locked) with one skill bar per displayed class
 * skill under it, and its hulls in up to three columns of 96px tiles.
 */
import { useTranslation } from 'react-i18next';
import { SHIP_TREE_GEOMETRY } from '@/engine/shipTree/layout';
import type { ShipTreeHullStatus, ShipTreeNode } from '@/engine/shipTree/types';
import { cx } from '@/lib/cx';
import type { ShipTreeShip } from '@/sde/types';
import { IsisTile } from './IsisTile';
import { SkillBlocks } from './SkillBlocks';
import { classSkillTitle } from './classSkillTitle';
import { classIconUrl } from './shipTreeAssets';
import type { FactionTree } from './useFactionTree';

const { TILE } = SHIP_TREE_GEOMETRY;

export function ClassNode({
  node,
  tree,
  statuses,
  trainedLevel,
  skillName,
  selectedTypeID,
  showNames,
  onSelect,
  onHover,
}: {
  node: ShipTreeNode;
  tree: FactionTree;
  statuses: ReadonlyMap<number, ShipTreeHullStatus>;
  trainedLevel: (skillTypeID: number) => number;
  skillName: (skillTypeID: number) => string;
  selectedTypeID: number | null;
  showNames: boolean;
  onSelect: (ship: ShipTreeShip) => void;
  onHover: (ship: ShipTreeShip | null, el?: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const group = tree.group(node.def.id);
  const unlocked = tree.unlocked(node.def.id);
  const ships = tree.hulls.get(node.def.id) ?? [];
  const skills = (group?.prereqsByFaction[String(tree.factionID)] ?? []).filter((p) => p.display);
  const name = group?.name ?? '';
  return (
    <section
      className="absolute"
      style={{ left: node.x, top: node.y, width: node.w }}
      aria-label={name}
      data-class={node.def.id}
      data-unlocked={unlocked}
    >
      <h2 className={cx('isis-label', !unlocked && 'locked')}>{name}</h2>
      <div className="isis-rule" />
      <div
        className={cx('isis-class', !unlocked && 'locked')}
        title={classSkillTitle(t, name, skills, trainedLevel, skillName)}
      >
        <span className="isis-icon">
          <img
            src={classIconUrl(group?.icon ?? '')}
            alt=""
            width={24}
            height={24}
            draggable={false}
          />
        </span>
        <SkillBlocks skills={skills} trainedLevel={trainedLevel} />
      </div>
      <div className="isis-grid" style={{ gridTemplateColumns: `repeat(${node.cols}, ${TILE}px)` }}>
        {ships.map((s) => (
          <IsisTile
            key={s.typeID}
            ship={s}
            status={statuses.get(s.typeID)}
            selected={selectedTypeID === s.typeID}
            showName={showNames}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </div>
      <div className="isis-rule-b" style={{ top: node.h + 6 }} />
    </section>
  );
}
