import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
const configured = process.env.SITE_URL;
const indexable = process.env.INDEXABLE === 'true';
if (indexable && !configured) throw new Error('INDEXABLE=true requires the actual deployed SITE_URL.');
let origin;
if (configured) { const url = new URL(configured); if (!['https:','http:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) throw new Error('SITE_URL must be a clean http(s) deployment URL.'); origin = url.href.replace(/\/?$/,'/'); }
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { App } = await server.ssrLoadModule('/src/main.jsx');
  let html = await readFile('dist/index.html','utf8');
  html = html.replace('<div id="root"></div>', `<div id="root">${renderToString(React.createElement(App))}</div>`);
  await writeFile('dist/index.html',html);
} finally { await server.close(); }
const pages = [ ['index.html','/','Campus Web Studio | Independent Portfolio Demo','Independent university web portfolio: accessible program page, content review workflow, and web maintenance evidence.'], ['alpine.html','/alpine.html','Editor Guide | Campus Web Studio','A keyboard-operable, progressively enhanced publishing checklist for campus editors.'] ];
for (const [file, route, title, description] of pages) {
  let html = await readFile(`dist/${file}`,'utf8');
  for (const match of html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)) {
    const asset = match[1].slice(match[1].indexOf('assets/'));
    html = html.replace(match[0],`<style>${await readFile(`dist/${asset}`,'utf8')}</style>`);
  }
  html = html.replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${indexable ? 'index,follow' : 'noindex,follow'}">`);
  const metadata = `<meta property="og:type" content="website"><meta property="og:site_name" content="Campus Web Studio"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta name="twitter:card" content="summary_large_image">` + (origin ? `<link rel="canonical" href="${origin}${route.slice(1)}"><meta property="og:url" content="${origin}${route.slice(1)}"><meta property="og:image" content="${origin}images/social-preview.jpg"><meta property="og:image:alt" content="Campus Web Studio independent portfolio concept">` : '');
  await writeFile(`dist/${file}`,html.replace('</head>',`${metadata}</head>`));
}
await copyFile('public/images/studio-1200.jpg','dist/images/social-preview.jpg');
await writeFile('dist/404.html',(await readFile('dist/404.html','utf8')).replace('href="/"',`href="${origin ? new URL(origin).pathname : '/'}"`));
await writeFile('dist/robots.txt', `User-agent: *\n${indexable ? 'Allow: /' : 'Disallow: /'}\n${origin && indexable ? `Sitemap: ${origin}sitemap.xml\n` : ''}`);
if (origin) await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(([,route]) => `<url><loc>${origin}${route.slice(1)}</loc></url>`).join('')}</urlset>`);
console.log(`Public content prerendered. Crawl mode: ${indexable ? 'indexable' : 'private demo'}. ${origin ? `Canonical origin: ${origin}` : 'Set SITE_URL for canonical URLs and sitemap.'}`);
