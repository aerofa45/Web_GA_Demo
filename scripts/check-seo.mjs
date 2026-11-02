import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const html = await readFile('dist/index.html','utf8');
for (const text of ['Your next chapter','Digital Media','July 1, 2027','application/ld+json','og:title','twitter:card']) assert.ok(html.includes(text),`Missing prerender/metadata: ${text}`);
assert.match(html,/<html lang="en">/);
const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(schema['@type'],'CreativeWork');
if (process.env.SITE_URL) {
  const origin = new URL(process.env.SITE_URL).href.replace(/\/?$/,'/');
  assert.ok(html.includes(`rel="canonical" href="${origin}"`));
  const sitemap = await readFile('dist/sitemap.xml','utf8'); assert.ok(sitemap.includes(`${origin}alpine.html`));
}
console.log('Prerendered content, metadata, structured data and configured canonical/sitemap passed.');
