import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A route's `PageHeader` `actions` keep the default (md) control size — see
 * DESIGN.md's `PageHeader` row. Controls in a `Panel` `actions` slot are `sm`;
 * the page header is the one place they are not.
 */
const ROUTES_DIR = __dirname;

// The Planetary Industry header is under overhaul and is not held to this yet.
const EXEMPT = /^PlanetaryIndustry/;

function smControlsInPageHeaderActions(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(ROUTES_DIR, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const found: string[] = [];

  // `size` on these is a glyph's size, not a control height.
  const NOT_CONTROLS = new Set(['Spinner', 'CharacterAvatar']);

  function isSmSizeAttribute(node: ts.Node): boolean {
    return (
      ts.isJsxAttribute(node) &&
      !NOT_CONTROLS.has((node.parent.parent as ts.JsxOpeningLikeElement).tagName.getText(source)) &&
      node.name.getText(source) === 'size' &&
      node.initializer !== undefined &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text === 'sm'
    );
  }

  function scanActions(node: ts.Node) {
    if (isSmSizeAttribute(node)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push(`${file}:${line + 1}`);
    }
    ts.forEachChild(node, scanActions);
  }

  function visit(node: ts.Node) {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(source) === 'PageHeader'
    ) {
      for (const attr of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attr) &&
          attr.name.getText(source) === 'actions' &&
          attr.initializer
        ) {
          scanActions(attr.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

describe('PageHeader actions control size', () => {
  const files = readdirSync(ROUTES_DIR).filter(
    (f) => f.endsWith('.tsx') && !f.includes('.test.') && !EXEMPT.test(f)
  );

  it('finds the route sources', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no size="sm" control inside a route PageHeader actions slot', () => {
    expect(files.flatMap(smControlsInPageHeaderActions)).toEqual([]);
  });
});
