import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
const artifacts=[['org/apache/velocity/velocity-engine-core/2.4.1','velocity-engine-core-2.4.1.jar'],['org/apache/commons/commons-lang3/3.20.0','commons-lang3-3.20.0.jar'],['org/slf4j/slf4j-api/2.0.17','slf4j-api-2.0.17.jar']];
await mkdir('work/velocity',{recursive:true});
for(const [dir,file] of artifacts) {
  const {existsSync}=await import('node:fs');
  if(!existsSync(`work/velocity/${file}`)) { const response=await fetch(`https://repo.maven.apache.org/maven2/${dir}/${file}`);if(!response.ok)throw Error(`Download failed: ${file}`);await writeFile(`work/velocity/${file}`,Buffer.from(await response.arrayBuffer())); }
}
const compile=spawnSync('javac',['-cp','work/velocity/*','-d','work/velocity','cascade/VelocityLab.java'],{stdio:'inherit'});
if(compile.error)throw Error('Install JDK 17+ so java and javac are on PATH.');if(compile.status)process.exit(compile.status);
const child=spawn('java',['-cp',`work/velocity${process.platform==='win32'?';':':'}work/velocity/*`,'VelocityLab',process.argv[2]||'test'],{stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
