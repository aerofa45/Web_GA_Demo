// Public staging connectivity and authorization smoke test. No data or accounts created.
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const base='https://web-ga-demo.onrender.com';
let latest;
for(let attempt=0;attempt<18;attempt++){
 try{
  const health=await fetch(base+'/healthz',{signal:AbortSignal.timeout(18000)});
  const healthBody=await health.json();
  const discovery=await fetch(base+'/.well-known/oauth-authorization-server',{signal:AbortSignal.timeout(18000)});
  const meta=await discovery.json().catch(()=>({}));
  const protectedResource=await fetch(base+'/.well-known/oauth-protected-resource',{signal:AbortSignal.timeout(18000)});
  const protectedBody=await protectedResource.json().catch(()=>({}));
  const unauthorized=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),signal:AbortSignal.timeout(18000)});
  latest={health:health.status,healthBody,discovery:discovery.status,issuer:meta.issuer,resourceMetadata:protectedResource.status,resource:protectedBody.resource,unauthorized:unauthorized.status,attempt:attempt+1};
  if(health.ok&&healthBody.status==='ok'&&discovery.ok&&meta.issuer===base&&meta.authorization_response_iss_parameter_supported===true&&protectedResource.ok&&protectedBody.resource===base+'/mcp'&&unauthorized.status===401)break;
 }catch(error){latest={attempt:attempt+1,error:String(error)}}
 if(attempt<17)await delay(10000);
}
console.log(JSON.stringify(latest,null,2));
assert.equal(latest?.health,200,'Staging health not ready');
assert.equal(latest?.discovery,200,'OAuth discovery missing');
assert.equal(latest?.resourceMetadata,200,'OAuth protected resource missing');
assert.equal(latest?.resource,base+'/mcp','MCP resource identity incorrect');
assert.equal(latest?.unauthorized,401,'Anonymous MCP access must be denied');
