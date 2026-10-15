// Enforces the PRD's component styling rules that ESLint can't see:
// no hex colours or raw pixel values in components, one scoped SCSS block per component,
// and a BEM root class named after the file.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const root = new URL('../apps/web/src', import.meta.url).pathname;
const errors = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.vue')) check(path);
  }
}

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function check(path) {
  const rel = relative(process.cwd(), path);
  const source = readFileSync(path, 'utf8');
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/#[0-9a-fA-F]{3,8}\b/.test(code) && !/&#/.test(code)) errors.push(`${rel}:${i + 1} hex colour: ${line.trim()}`);
    if (/(^|[^\w-])\d+(\.\d+)?px\b/.test(code)) errors.push(`${rel}:${i + 1} raw pixel value: ${line.trim()}`);
  });

  const styles = [...source.matchAll(/<style([^>]*)>/g)];
  const isView = rel.includes('/views/') || basename(path) === 'App.vue';
  if (styles.length > 1) errors.push(`${rel}: more than one <style> block`);
  for (const [, attrs] of styles) {
    if (!/lang="scss"/.test(attrs) || !/\bscoped\b/.test(attrs)) errors.push(`${rel}: <style> must be lang="scss" scoped`);
  }
  if (styles.length === 1 && !isView) {
    const rootClass = `.${kebab(basename(path, '.vue'))}`;
    const style = source.slice(source.indexOf('<style'));
    if (!new RegExp(`^\\${rootClass}\\s*\\{`, 'm').test(style)) errors.push(`${rel}: missing BEM root class ${rootClass}`);
  }
}

walk(root);
if (errors.length > 0) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} style rule violation(s).`);
  process.exit(1);
}
console.log('style rules: ok');
