import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const root = path.resolve('dist');
const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.xml':'application/xml','.txt':'text/plain' };
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (!(await stat(file)).isFile()) throw new Error();
    const headers={'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':file.includes(`${path.sep}assets${path.sep}`)?'public, max-age=31536000, immutable':'public, max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
    let bytes=await readFile(file);
    if (/\b(gzip)\b/.test(req.headers['accept-encoding']||'') && /\.(html|js|css|json|xml|svg|txt)$/.test(file)) {bytes=gzipSync(bytes);headers['Content-Encoding']='gzip';headers.Vary='Accept-Encoding';}
    headers['Content-Length']=bytes.length;res.writeHead(200,headers);res.end(bytes);
  } catch { res.writeHead(404,{'Content-Type':'text/plain'}).end('Page not found'); }
}).listen(Number(process.env.PORT || 4188),'127.0.0.1',() => console.log(`Built portfolio: http://127.0.0.1:${process.env.PORT || 4188}`));
