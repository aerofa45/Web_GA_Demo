// Staging end-to-end public/anonymous journey: real deployed HTTP, no test users or mutations.
import assert from 'node:assert/strict';
const base='https://web-ga-demo.onrender.com';
const request=async(path,options={})=>fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(25000),...options});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){
 for(let i=0;i<12;i++){
  try{const r=await request('/healthz');if(r.ok&&((await r.json()).status==='ok'))return;}catch{}
  await wait(10000);
 }
 throw Error('Staging did not become healthy');
}
await ready();
const page=await request('/assistant-workspace');
assert.equal(page.status,200,'Workspace page must load');
const html=await page.text();
assert.match(html,/assistant-workspace\.js/,'Workspace must load its application script');
assert.match(html,/Confirm and save/,'Workspace must offer explicit confirmation');
assert.match(html,/Generate real LMS assignments and quizzes/,'Assessment preview must be exposed');
const script=await request('/assistant-workspace.js');
assert.equal(script.status,200,'Workspace application script must load');
assert.ok((await script.text()).length>500,'Workspace script must not be empty');
const oauth=await request('/.well-known/oauth-authorization-server');
assert.equal(oauth.status,200,'OAuth discovery');
const metadata=await oauth.json();
assert.equal(metadata.issuer,base);
assert.ok(metadata.code_challenge_methods_supported?.includes('S256'));
const protectedResource=await request('/.well-known/oauth-protected-resource');
assert.equal(protectedResource.status,200);
assert.equal((await protectedResource.json()).resource,base+'/mcp');
const anon=await request('/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
assert.equal(anon.status,401,'MCP tools must not be available anonymously');
assert.match(anon.headers.get('www-authenticate')||'',/resource_metadata=/);
for(const path of ['/api/assistant/history','/api/assistant/versions','/api/assistant/resources']){
 const r=await request(path);
 assert.equal(r.status,401,path+' must require authentication');
}
const badToken=await request('/mcp',{method:'POST',headers:{authorization:'Bearer '+'x'.repeat(43),'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
assert.equal(badToken.status,401,'Invalid OAuth token must be rejected');
console.log('PASS: staging public workspace, assets, OAuth metadata, anonymous resource protection, invalid-token protection.');
