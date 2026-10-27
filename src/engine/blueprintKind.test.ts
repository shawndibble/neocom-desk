import { describe, expect, it } from 'vitest';
import { assetBlueprintKind, mayBeBlueprintName } from './blueprintKind';

const BLUEPRINTS: ReadonlySet<number> = new Set([691, 46166]);

describe('assetBlueprintKind', () => {
  it('reads a flagged copy as a BPC', () => {
    expect(assetBlueprintKind({ type_id: 691, is_blueprint_copy: true }, BLUEPRINTS)).toBe('copy');
  });

  it('reads a flagged copy as a BPC before the blueprint set has loaded', () => {
    expect(assetBlueprintKind({ type_id: 691, is_blueprint_copy: true }, null)).toBe('copy');
  });

  it('reads an unflagged blueprint type as a BPO', () => {
    expect(assetBlueprintKind({ type_id: 691 }, BLUEPRINTS)).toBe('original');
    expect(assetBlueprintKind({ type_id: 46166, is_blueprint_copy: false }, BLUEPRINTS)).toBe(
      'original'
    );
  });

  it('says nothing about an unflagged asset while the blueprint set is unknown', () => {
    expect(assetBlueprintKind({ type_id: 691 }, null)).toBeNull();
  });

  it('says nothing about a type that is not a blueprint', () => {
    expect(assetBlueprintKind({ type_id: 34 }, BLUEPRINTS)).toBeNull();
  });
});

describe('mayBeBlueprintName', () => {
  it('matches blueprint and reaction formula names', () => {
    expect(mayBeBlueprintName('Rifter Blueprint')).toBe(true);
    expect(mayBeBlueprintName('Carbon Fiber Reaction Formula')).toBe(true);
    expect(mayBeBlueprintName('Tritanium Formula')).toBe(true);
  });

  it('does not match ordinary items', () => {
    expect(mayBeBlueprintName('Tritanium')).toBe(false);
    expect(mayBeBlueprintName('Rifter')).toBe(false);
    expect(mayBeBlueprintName('Blueprints for Dummies Book')).toBe(false);
  });
});
