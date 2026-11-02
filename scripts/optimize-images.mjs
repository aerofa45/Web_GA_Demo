import sharp from 'sharp';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
const dir = new URL('../public/images/', import.meta.url);
await mkdir(dir, { recursive: true });
const report = [];
for (const [prefix, sourceName, ratio] of [['campus','campus-source.svg',.75],['studio','studio-edited-source.jpg',2/3]]) {
const source = await readFile(new URL(sourceName, dir));
for (const width of [640, prefix === 'studio' ? 1200 : 1280]) {
  for (const format of ['webp', 'jpg']) {
    const name = `${prefix}-${width}.${format}`;
    const pipeline = sharp(source).resize(width, Math.round(width * ratio));
    const buffer = format === 'webp' ? await pipeline.webp({ quality: 78 }).toBuffer() : await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    await writeFile(new URL(name, dir), buffer);
    report.push({ file: name, width, height: Math.round(width * ratio), bytes: (await stat(new URL(name, dir))).size });
  }
}
}
await writeFile(new URL('manifest.json', dir), JSON.stringify(report, null, 2));
console.table(report);
