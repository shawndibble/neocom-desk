import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const DEFAULT_SIZE: Readonly<Record<string, string>> = {
  Button: 'md',
  TextInput: 'md',
  NativeSelect: 'md',
  SelectTrigger: 'md',
  MultiSelect: 'md',
  CheckboxSelect: 'md',
  RegionSelect: 'md',
  DataTableSortPicker: 'md',
  SegmentedControl: 'md',
  FilterChip: 'sm',
};
const FIXED_SIZE: Readonly<Record<string, string>> = { SearchInput: 'md' };

const ROOTS = ['src/routes', 'src/features', 'src/components', 'src/app'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.tsx') && !/\.(test|stories)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

type JsxLike = ts.JsxElement | ts.JsxSelfClosingElement;

function openingOf(node: JsxLike): ts.JsxOpeningLikeElement {
  return ts.isJsxElement(node) ? node.openingElement : node;
}

function controlOf(node: JsxLike): ts.JsxOpeningLikeElement {
  const opening = openingOf(node);
  if (opening.tagName.getText() !== 'Select') return opening;
  let trigger: ts.JsxOpeningLikeElement = opening;
  const find = (n: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
      n.tagName.getText() === 'SelectTrigger'
    )
      trigger = n;
    else ts.forEachChild(n, find);
  };
  ts.forEachChild(node, find);
  return trigger;
}

function elementsOfExpression(expr: ts.Expression): JsxLike[] {
  if (ts.isParenthesizedExpression(expr)) return elementsOfExpression(expr.expression);
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr)) return [expr];
  if (ts.isJsxFragment(expr)) return expr.children.flatMap(elementsOfChild);
  if (ts.isConditionalExpression(expr))
    return [...elementsOfExpression(expr.whenTrue), ...elementsOfExpression(expr.whenFalse)];
  if (
    ts.isBinaryExpression(expr) &&
    (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      expr.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  )
    return elementsOfExpression(expr.right);
  return [];
}

function elementsOfChild(child: ts.JsxChild): JsxLike[] {
  if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) return [child];
  if (ts.isJsxFragment(child)) return child.children.flatMap(elementsOfChild);
  if (ts.isJsxExpression(child) && child.expression) return elementsOfExpression(child.expression);
  return [];
}

function classNameText(opening: ts.JsxOpeningLikeElement): string | null {
  const attr = opening.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === 'className'
  );
  if (!attr?.initializer) return null;
  const parts: string[] = [];
  const collect = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node))
      parts.push(node.text);
    else if (ts.isTemplateTail(node)) parts.push(node.text);
    ts.forEachChild(node, collect);
  };
  collect(attr.initializer);
  return parts.join(' ');
}

function isFlexRow(opening: ts.JsxOpeningLikeElement): boolean {
  const tag = opening.tagName.getText();
  if (!/^[a-z]/.test(tag)) return false;
  const tokens = (classNameText(opening) ?? '').split(/\s+/);
  return (
    tokens.some((t) => t === 'flex' || t === 'inline-flex') &&
    !tokens.some((t) => /(^|:)flex-col/.test(t))
  );
}

function isExempt(opening: ts.JsxOpeningLikeElement): boolean {
  return opening.attributes.properties.some(
    (p) =>
      ts.isJsxAttribute(p) &&
      p.name.getText() === 'data-inline-height' &&
      p.initializer !== undefined &&
      ts.isStringLiteral(p.initializer) &&
      p.initializer.text === 'exempt'
  );
}

function sizeOf(opening: ts.JsxOpeningLikeElement): string | null {
  const tag = opening.tagName.getText();
  if (isExempt(opening)) return null;
  if (tag in FIXED_SIZE) return FIXED_SIZE[tag]!;
  if (!(tag in DEFAULT_SIZE)) return null;
  const props = opening.attributes.properties;
  if (props.some(ts.isJsxSpreadAttribute)) return null;
  const size = props.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === 'size'
  );
  if (!size) return DEFAULT_SIZE[tag]!;
  const init = size.initializer;
  if (init && ts.isStringLiteral(init)) return init.text;
  if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression))
    return init.expression.text;
  return null;
}

export function mixedSizeRows(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rows: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && isFlexRow(node.openingElement) && !isExempt(node.openingElement)) {
      const sized = node.children
        .flatMap(elementsOfChild)
        .map((child) => {
          const opening = controlOf(child);
          return { tag: opening.tagName.getText(), size: sizeOf(opening) };
        })
        .filter((c): c is { tag: string; size: string } => c.size !== null);
      if (new Set(sized.map((c) => c.size)).size > 1) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        rows.push(`${file}:${line + 1}  ${sized.map((c) => `${c.tag}=${c.size}`).join(' ')}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return rows;
}

describe('inline control sizes', () => {
  it('reads a mixed row, and not a column, an unknown size or a matched row', () => {
    const check = (jsx: string) => mixedSizeRows('x.tsx', `const a = ${jsx};`);
    expect(check('<div className="flex gap-2"><Button size="sm" /><TextInput /></div>')).toEqual([
      'x.tsx:1  Button=sm TextInput=md',
    ]);
    expect(
      check('<div className={cx("flex", x)}>{open && <FilterChip />}<SearchInput /></div>')
    ).toEqual(['x.tsx:1  FilterChip=sm SearchInput=md']);
    expect(check('<div className="flex flex-col"><Button size="sm" /><TextInput /></div>')).toEqual(
      []
    );
    expect(check('<div className="flex"><Button size={s} /><TextInput /></div>')).toEqual([]);
    expect(check('<div className="flex"><FilterChip size="md" /><SearchInput /></div>')).toEqual(
      []
    );
    expect(
      check(
        '<div className="flex" data-inline-height="exempt"><Button size="sm" /><Button /></div>'
      )
    ).toEqual([]);
    expect(
      check('<div className="flex"><Select><SelectTrigger size="sm" /></Select><Button /></div>')
    ).toEqual(['x.tsx:1  SelectTrigger=sm Button=md']);
  });

  it('lists only controls src/components/ui still exports', () => {
    const exported = sourceFiles('src/components/ui')
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    const missing = [...Object.keys(DEFAULT_SIZE), ...Object.keys(FIXED_SIZE)].filter(
      (tag) => !new RegExp(`export (const|function) ${tag}\\b`).test(exported)
    );
    expect(missing).toEqual([]);
  });

  it('finds no row whose controls mix sizes (DESIGN.md §3)', () => {
    const found = ROOTS.flatMap(sourceFiles).flatMap((path) =>
      mixedSizeRows(relative('.', path), readFileSync(path, 'utf8'))
    );
    expect(found).toEqual([]);
  });
});
