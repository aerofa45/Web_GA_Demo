import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('evidence',{recursive:true});
const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags:['--headless','--no-sandbox','--disable-dev-shm-usage'] });
try {
  const result = await lighthouse(process.env.AUDIT_URL || 'http://127.0.0.1:4188/', { port:chrome.port, output:['html','json'], onlyCategories:['performance','accessibility','best-practices','seo'] });
  await writeFile('evidence/lighthouse.html',result.report[0]);
  await writeFile('evidence/lighthouse.json',result.report[1]);
  const summary = Object.fromEntries(Object.entries(result.lhr.categories).map(([id,c]) => [id,Math.round(c.score*100)]));
  await writeFile('evidence/performance-summary.json',JSON.stringify({url:result.lhr.finalDisplayedUrl,fetchTime:result.lhr.fetchTime,scores:summary,metrics:Object.fromEntries(['first-contentful-paint','largest-contentful-paint','cumulative-layout-shift','total-blocking-time'].map(id => [id,result.lhr.audits[id].displayValue])),note:'Single local Lighthouse mobile lab run; not field Core Web Vitals or WCAG certification.'},null,2));
  console.log(summary);
} finally { await chrome.kill(); }
