import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { ReportGenerator } from 'lighthouse/report/generator/report-generator.js';
const lhr = JSON.parse(await fs.readFile('evidence/lighthouse.json','utf8'));
for (const id of ['screenshot-thumbnails','final-screenshot','full-page-screenshot']) delete lhr.audits[id];
delete lhr.fullPageScreenshot;
lhr.runWarnings.push('Repository packaging omits embedded screenshot-only diagnostics to reduce file size. Audit scores and performance metrics are unchanged. Full originals are retained in the downloadable package.');
for(const [name,data] of [['lighthouse.html',ReportGenerator.generateReportHtml(lhr)],['lighthouse.json',JSON.stringify(lhr)]]) await fs.writeFile(`evidence/${name}.gz`,gzipSync(Buffer.from(data),{level:9}));
for(const name of ['program','studio']) {
  const source=`work/${name==='program'?'program-1440':'studio-desktop'}.png`;
  await sharp(source).resize({width:1000}).jpeg({quality:65,mozjpeg:true}).toFile(`docs/${name}-preview.jpg`);
}
console.log('Repository report variants omit screenshots, retain scores/metrics, and are compressed. Raw reports remain local.');
