import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
for(const name of ['lighthouse.html','lighthouse.json']) await writeFile(`evidence/${name}`,gunzipSync(await readFile(`evidence/${name}.gz`)));
console.log('Open evidence/lighthouse.html for the full interactive report.');
