import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const chartFiles = sourceFiles(__dirname).filter((path) =>
  /from 'recharts'/.test(readFileSync(path, 'utf8'))
);

describe('chart tooltip shell', () => {
  it('finds the chart files', () => {
    expect(chartFiles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(chartFiles)('%s uses the shared popover shell, not an inline style', (path) => {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('shadow-black/50');
    expect(source).not.toContain('tooltipContentStyle');
    expect(source).not.toMatch(/style=\{\{\s*background/);
  });
});
