// Pure formatting for the Storybook components manifest (`ui:catalog`).
// Output is compact text for an agent's context, not for humans to browse.

const firstLine = (text = '') =>
  text
    .replace(/^@summary\s*/, '')
    .split('\n')[0]
    .trim();

export const findComponent = (manifest, name) =>
  Object.values(manifest.components).find((c) => c.name.toLowerCase() === name.toLowerCase());

export const formatList = (manifest) =>
  Object.values(manifest.components)
    .map((c) => `${c.name} - ${c.summary || '(no summary)'}`)
    .join('\n');

const formatProp = (name, prop) => {
  const type = prop.tsType?.raw ?? prop.tsType?.name;
  const def = prop.defaultValue ? ` = ${prop.defaultValue.value}` : '';
  const desc = firstLine(prop.description);
  return `  ${name}${prop.required ? '' : '?'}${type ? `: ${type}` : ''}${def}${desc ? ` - ${desc}` : ''}`;
};

export const formatComponent = (component) => {
  const lines = [`${component.name} - ${component.summary || '(no summary)'}`];
  if (component.error) lines.push(`Manifest error: ${component.error.message}`);
  const description = component.description?.trim();
  if (description) lines.push('', description);
  const props = Object.entries(component.reactDocgen?.props ?? {});
  if (props.length) lines.push('', 'Props:', ...props.map(([n, p]) => formatProp(n, p)));
  if (component.stories?.length) {
    lines.push(
      '',
      'Stories (`npm run ui:shot <id>`):',
      ...component.stories.map((s) => `  ${s.id} - ${s.name}${s.summary ? `: ${s.summary}` : ''}`)
    );
  }
  return lines.join('\n');
};

const distance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
};

/** Names containing the query (either way round) or within 2 edits of it. */
export const closeMatches = (query, names) => {
  const q = query.toLowerCase();
  return names.filter((n) => {
    const l = n.toLowerCase();
    return l.includes(q) || q.includes(l) || distance(q, l) <= 2;
  });
};
