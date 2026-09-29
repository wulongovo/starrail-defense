import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
await mkdir(dist, { recursive: true });
await import('./prepare-assets.mjs');

await build({
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  globalName: 'WulongStarRail',
  target: 'es2020',
  outfile: 'dist/game.js',
  minify: true,
  legalComments: 'inline',
  sourcemap: false,
  logLevel: 'warning',
});

const [shell, javascript, stylesheet] = await Promise.all([
  readFile(join(root, 'index.html'), 'utf8'),
  readFile(join(dist, 'game.js'), 'utf8'),
  readFile(join(root, 'src/styles.css'), 'utf8'),
]);
const { code: css } = await transform(stylesheet, { loader: 'css', minify: true, target: 'es2020' });

// wulong: the distributable deliberately includes its renderer and styles inline.
let html = shell
  .replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*(?:src\/main\.js|game\.js)[^"']*["'][^>]*>\s*<\/script\s*>/gi, '')
  .replace(/<link\b(?=[^>]*\brel\s*=\s*["']stylesheet["'])[^>]*>/gi, '');
if (!/<\/head\s*>/i.test(html) || !/<\/body\s*>/i.test(html)) {
  throw new Error('index.html must contain closing head and body tags.');
}
if (/<script\b[^>]*\bsrc\s*=/i.test(html)) {
  throw new Error('A script URL remains in the HTML shell; the offline build must be self-contained.');
}
html = html
  .replace(/<\/head\s*>/i, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>\n</head>`)
  .replace(/<\/body\s*>/i, () => `<script>${javascript.replace(/<\/script/gi, '<\\/script')}</script>\n</body>`);

await Promise.all([
  writeFile(join(dist, '星穹防线.html'), html, 'utf8'),
  writeFile(join(dist, 'index.html'), html, 'utf8'),
]);
console.log(`Offline build ready: ${join(dist, '星穹防线.html')} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
