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

// A recharts helper file with no `<Tooltip>` of its own (shared axes, dots) has no bubble to wrap.
const chartFiles = sourceFiles(__dirname).filter((path) => {
  const source = readFileSync(path, 'utf8');
  return /from 'recharts'/.test(source) && /<Tooltip\b/.test(source);
});

describe('chart tooltip shell', () => {
  it('finds the chart files', () => {
    expect(chartFiles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(chartFiles)(
    '%s uses ChartTooltipShell, not an inline style or its own bubble',
    (path) => {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('<ChartTooltipShell>');
      expect(source).not.toContain('shadow-black/50');
      expect(source).not.toContain('tooltipContentStyle');
      expect(source).not.toContain('contentStyle=');
    }
  );
});
