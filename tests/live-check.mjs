// Explicit opt-in: creates two fictional QA accounts on the selected beta.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const base=process.env.FORMA_TEST_URL;
if(!base)throw Error('Set FORMA_TEST_URL to explicitly run hosted QA.');
const suffix=Date.now().toString(36),password=randomBytes(24).toString('hex');
const notes=[];
async function req(route,{method='GET',body,cookie}={}){const r=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{}),origin:base},body:body?JSON.stringify(body):undefined});return {status:r.status,headers:r.headers,body:await r.json()};}
async function signup(label){const slug='qa-'+label+'-'+suffix;const r=await req('/api/register',{method:'POST',body:{name:'Fictional QA '+label,email:slug+'@example.invalid',slug,password}});assert.equal(r.status,201,JSON.stringify(r.body));assert.match(r.headers.get('set-cookie'),/Secure/);return {slug,profile:r.body.profile,cookie:r.headers.get('set-cookie').split(';')[0]};}
const a=await signup('alpha'),b=await signup('beta');notes.push('Two fictional test accounts registered with secure sessions.');
const png=await sharp({create:{width:120,height:80,channels:3,background:'#72ead3'}}).png().toBuffer();
const image=await req('/api/images',{method:'POST',cookie:a.cookie,body:{data:'data:image/png;base64,'+png.toString('base64')}});assert.equal(image.status,201,JSON.stringify(image.body));
const published={...a.profile,name:'Fictional QA portfolio',bio:'Automated deployment verification. This is fictional sample content.',heroImage:image.body.url,projects:[{title:'Hosted persistence check',description:'Public sample created to verify publishing.'}]};
assert.equal((await req('/api/profile',{method:'PUT',cookie:a.cookie,body:published})).status,200);
assert.equal((await req('/api/public/'+a.slug)).body.profile.heroImage,image.body.url);assert.equal((await fetch(image.body.url)).status,200);notes.push('Image uploaded to persistent Supabase storage and published portfolio fetched.');
assert.equal((await req('/api/public/'+a.slug)).body.profile.email,'');
assert.equal((await req('/api/contact/'+a.slug,{method:'POST',body:{sender:'Fictional Visitor',email:'visitor@example.invalid',message:'Automated test message only.'}})).status,201);
assert.equal((await req('/api/messages',{cookie:a.cookie})).body.messages.length,1);assert.equal((await req('/api/messages',{cookie:b.cookie})).body.messages.length,0);assert.equal((await req('/api/messages')).status,401);notes.push('Private inbox isolated from another account and anonymous requests.');
for(const route of ['/api/withdrawals','/api/courses/example/checkout','/api/stripe/webhook','/api/media'])assert.equal((await req(route,{method:'POST',cookie:a.cookie,body:{}})).status,403);notes.push('Hosted payment and video routes blocked.');
assert.equal((await req('/api/logout',{method:'POST',cookie:a.cookie,body:{}})).status,200);assert.equal((await req('/api/me',{cookie:a.cookie})).body.user,null);notes.push('Logout invalidated server-side session.');
const report={base,checkedAt:new Date().toISOString(),checks:notes,publicTestPortfolio:base+'/u/'+a.slug,publicTestImage:image.body.url,testSlugs:[a.slug,b.slug],note:'Fictional QA accounts only; no real user database imported. Passwords are not stored in this report.'};
if(process.env.FORMA_REPORT_PATH)await writeFile(process.env.FORMA_REPORT_PATH,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
