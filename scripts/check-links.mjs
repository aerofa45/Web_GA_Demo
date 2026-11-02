import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const base = process.env.SITE_URL ? new URL(process.env.SITE_URL).pathname.replace(/\/?$/,'/') : '/';
async function walk(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(path.join(dir,e.name)) : path.join(dir,e.name)))).flat(); }
const files = await walk(root);
const errors = [];
for (const file of files.filter(f => f.endsWith('.html'))) {
  const html = await readFile(file, 'utf8');
  for (const [,url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:|#)/.test(url)) continue;
    const relative = (url.startsWith(base) ? url.slice(base.length) : url.replace(/^\//,'')).split(/[?#]/)[0];
    const target = path.resolve(url.startsWith('/') ? root : path.dirname(file), relative || 'index.html');
    if (target === root || files.includes(target) || files.includes(path.join(target, 'index.html'))) continue;
    errors.push(`${path.relative(root,file)}: ${url}`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Built HTML local href/src targets passed. React-rendered links and external URLs require browser/manual checks.');
