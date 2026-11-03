'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {createApp}=require('../cloud-server');
const {validateOutline}=require('../course');
test('Course themes accept supported styles and reject arbitrary input',()=>{
 for(const theme of ['midnight','daylight','forest'])assert.equal(validateOutline({chapters:[],theme}).theme,theme);
 assert.throws(()=>validateOutline({chapters:[],theme:'invalid'}),/Invalid course outline/);
 assert.throws(()=>validateOutline({chapters:[],theme:'forest'},{generated:true}),/Invalid course outline/);
});
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
test('OAuth PKCE, refresh, scoped MCP access and revocation',async t=>{
 const flag=process.env.FORMA_MCP_ENABLED;process.env.FORMA_MCP_ENABLED='true';t.after(()=>{if(flag===undefined)delete process.env.FORMA_MCP_ENABLED;else process.env.FORMA_MCP_ENABLED=flag});
 const uid='a'.repeat(48),other='b'.repeat(48),cookie='c'.repeat(48),cid='d'.repeat(48);
 const rateCalls=[];
 const tables={
  forma_sessions:[{tokenhash:sha(cookie),user_id:uid,expires:Date.now()+3600000}],
  forma_users:[{id:uid,email:'owner@example.test',name:'Instructor',slug:'owner'},{id:other,email:'other@example.test',name:'Other',slug:'other'}],
  forma_profiles:[{user_id:uid,data:{name:'Instructor',bio:'Owner biography',experience:[],education:[],research:[],projects:[],publications:[]},updated:123}],
  forma_account_roles:[{user_id:uid,role:'instructor'}],
  forma_course_drafts:[{id:cid,user_id:uid,title:'My class',published:false,outline:{chapters:[]},updated:123},{id:'e'.repeat(48),user_id:other,title:'Private other class',published:false,outline:{chapters:[]},updated:123}],
  forma_oauth_clients:[],forma_oauth_codes:[],forma_oauth_tokens:[],forma_assignments:[],forma_quizzes:[],forma_assistant_audit:[],forma_test_orders:[],forma_test_subscriptions:[]
 };
 const store={key:'test-secret-key',url:'https://example.supabase.co',async rpc(name,args){
  if(name==='forma_limit'){rateCalls.push(args);return true;}
  if(name==='forma_oauth_consume_code'){const i=tables.forma_oauth_codes.findIndex(c=>c.code_hash===args.p_hash&&c.client_id===args.p_client_id&&c.redirect_uri===args.p_redirect_uri&&c.challenge===args.p_challenge&&c.expires>args.p_now);if(i<0)return null;const c=tables.forma_oauth_codes.splice(i,1)[0];return {user_id:c.user_id,scopes:c.scopes}}
  if(name==='forma_assistant_add_assessments'){
   if(args.p_user_id!==uid||args.p_course_id!==cid)return {saved:false};
   if(tables.forma_assistant_audit.some(x=>x.id===args.p_audit_id))return {saved:true,replayed:true};
   tables.forma_assignments.push(...structuredClone(args.p_assignments));
   tables.forma_quizzes.push(...structuredClone(args.p_quizzes));
   tables.forma_assistant_audit.push({id:args.p_audit_id,user_id:args.p_user_id});
   return {saved:true};
  }
  if(name==='forma_oauth_rotate_refresh'){const row=tables.forma_oauth_tokens.find(c=>c.refresh_hash===args.p_refresh_hash&&c.client_id===args.p_client_id&&c.refresh_expires>args.p_now);if(!row)return null;row.access_hash=args.p_new_access_hash;row.refresh_hash=args.p_new_refresh_hash;row.expires=args.p_now+3600000;return {user_id:row.user_id,scopes:row.scopes}}
  return null;
 },async rest(table,query='',method='GET',payload){
  if(!tables[table])throw Error('Missing fixture table '+table);
  const p=new URLSearchParams(query),matches=r=>[...p].every(([k,v])=>['select','limit','order'].includes(k)||v.startsWith('eq.')&&String(r[k])===decodeURIComponent(v.slice(3))||v.startsWith('gt.')&&r[k]>Number(v.slice(3))||v.startsWith('in.(')&&v.endsWith(')')&&v.slice(4,-1).split(',').includes(String(r[k])));
  const rows=tables[table].filter(matches);
  if(method==='POST'){tables[table].push(structuredClone(payload));return null}
  if(method==='PATCH'){for(const row of rows)Object.assign(row,structuredClone(payload));return null}
  if(method==='DELETE'){tables[table]=tables[table].filter(x=>!matches(x));return null}
  return structuredClone(rows).map(row=>p.has('select')&&p.get('select')!=='*'?Object.fromEntries(p.get('select').split(',').map(k=>[k,row[k]])):row);
 }};
 const server=http.createServer(createApp(store,{origin:'https://web-ga-demo.onrender.com',fetcher:async url=>{if(String(url).startsWith('https://api.stripe.com/v1/checkout/sessions?payment_intent='))return {ok:true,json:async()=>({data:[{id:'cs_test_refund_fixture',livemode:false}]})};throw Error('Unexpected outbound request: '+url)}}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close()});
 const base='http://127.0.0.1:'+server.address().port;
 const call=(url,options={})=>fetch(base+url,{redirect:'manual',...options});
 const stripeKeyBefore=process.env.STRIPE_TEST_SECRET_KEY,stripeWebhookBefore=process.env.STRIPE_TEST_WEBHOOK_SECRET;
 t.after(()=>{if(stripeKeyBefore===undefined)delete process.env.STRIPE_TEST_SECRET_KEY;else process.env.STRIPE_TEST_SECRET_KEY=stripeKeyBefore;if(stripeWebhookBefore===undefined)delete process.env.STRIPE_TEST_WEBHOOK_SECRET;else process.env.STRIPE_TEST_WEBHOOK_SECRET=stripeWebhookBefore;});
 delete process.env.STRIPE_TEST_SECRET_KEY;delete process.env.STRIPE_TEST_WEBHOOK_SECRET;
 const noStripe=await call('/api/stripe-test/webhook',{method:'POST',body:'{}'});assert.equal(noStripe.status,503,'Test webhook must fail closed without test credentials');
 process.env.STRIPE_TEST_SECRET_KEY='sk_test_fixture_only';process.env.STRIPE_TEST_WEBHOOK_SECRET='whsec_fixture_only';
 const unsigned=await call('/api/stripe-test/webhook',{method:'POST',body:'{}'});assert.equal(unsigned.status,400,'Unsigned webhook must be rejected');
 const payload=JSON.stringify({id:'evt_test_fixture',type:'ping',livemode:false});
 const ts=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',process.env.STRIPE_TEST_WEBHOOK_SECRET).update(ts+'.'+payload).digest('hex');
 const signed=await call('/api/stripe-test/webhook',{method:'POST',headers:{'stripe-signature':'t='+ts+',v1='+signature,'Content-Type':'application/json'},body:payload});assert.equal(signed.status,200,'Valid signed test webhook must be acknowledged');
 const pendingOrder={id:'f'.repeat(48),course_id:cid,student_id:uid,amount_cents:500,currency:'usd',checkout_session_id:'cs_test_expired_fixture',status:'pending',created:Date.now()};
 tables.forma_test_orders.push(pendingOrder);
 const expiredBody=JSON.stringify({id:'evt_expired_fixture',type:'checkout.session.expired',data:{object:{id:'cs_test_expired_fixture',livemode:false}}});
 const expiredSig=crypto.createHmac('sha256',process.env.STRIPE_TEST_WEBHOOK_SECRET).update(ts+'.'+expiredBody).digest('hex');
 const expired=await call('/api/stripe-test/webhook',{method:'POST',headers:{'stripe-signature':'t='+ts+',v1='+expiredSig},body:expiredBody});assert.equal(expired.status,200);assert.equal(pendingOrder.status,'expired');
 tables.forma_course_enrollments=[{course_id:cid,email:'owner@example.test',status:'approved',created:Date.now(),updated:Date.now()}];
 tables.forma_drive_video_grants=[];
 tables.forma_test_orders.push({id:'9'.repeat(48),course_id:cid,student_id:uid,amount_cents:500,currency:'usd',checkout_session_id:'cs_test_refund_fixture',status:'paid',created:Date.now(),paid_at:Date.now()});
 const refundBody=JSON.stringify({id:'evt_refund_fixture',type:'charge.refunded',data:{object:{livemode:false,payment_intent:'pi_refund_fixture',refunded:true}}});
 const refundSig=crypto.createHmac('sha256',process.env.STRIPE_TEST_WEBHOOK_SECRET).update(ts+'.'+refundBody).digest('hex');
 const refunded=await call('/api/stripe-test/webhook',{method:'POST',headers:{'stripe-signature':'t='+ts+',v1='+refundSig},body:refundBody});
 assert.equal(refunded.status,200,'Signed refund must be processed');
 assert.equal(tables.forma_test_orders.find(x=>x.checkout_session_id==='cs_test_refund_fixture').status,'refunded');
 assert.equal(tables.forma_course_enrollments[0].status,'revoked','Refund must revoke enrolled course access');
 const staleTs=ts-3600,staleSignature=crypto.createHmac('sha256',process.env.STRIPE_TEST_WEBHOOK_SECRET).update(staleTs+'.'+payload).digest('hex');
 const staleStripe=await call('/api/stripe-test/webhook',{method:'POST',headers:{'stripe-signature':'t='+staleTs+',v1='+staleSignature},body:payload});assert.equal(staleStripe.status,400,'Expired webhook signatures must be rejected');
 const authCookie='forma_session='+cookie;
 const meta=await call('/.well-known/oauth-protected-resource');assert.equal(meta.status,200);
 const resource=(await meta.json()).resource;assert.equal(resource,'https://web-ga-demo.onrender.com/mcp');
 const discovery=await call('/.well-known/oauth-authorization-server');assert.equal(discovery.status,200);assert.equal((await discovery.json()).authorization_response_iss_parameter_supported,true);
 const registration=await call('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'ChatGPT test',redirect_uris:['https://chatgpt.com/oauth/callback'],token_endpoint_auth_method:'none'})});
 assert.equal(registration.status,201);const client=await registration.json();
 const verifier=crypto.randomBytes(32).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
 const qp=new URLSearchParams({client_id:client.client_id,redirect_uri:'https://chatgpt.com/oauth/callback',response_type:'code',code_challenge_method:'S256',code_challenge:challenge,state:'random-test-state',scope:'portfolio:read course:read course:write',resource});
 const unauth=await call('/oauth/authorize?'+qp);assert.equal(unauth.status,401);
 const consent=await call('/oauth/authorize?'+qp,{headers:{cookie:authCookie}});assert.equal(consent.status,200);
 assert.match(consent.headers.get('content-security-policy'),/form-action 'self' https:\/\/chatgpt\.com/);
 const page=await consent.text(),nonce=/name="nonce" value="([^"]+)"/.exec(page)?.[1];assert.ok(nonce);
 const consent_expires=/name="consent_expires" value="([^"]+)"/.exec(page)?.[1];
 const consent_signature=/name="consent_signature" value="([^"]+)"/.exec(page)?.[1];
 assert.ok(consent_expires&&consent_signature,'Consent must contain signed expiry and CSRF token');
 const fields={...Object.fromEntries(qp),nonce,consent_expires,consent_signature,decision:'approve'};
 const forged=await call('/oauth/authorize',{method:'POST',headers:{cookie:authCookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,state:'forged-state'})});
 assert.equal(forged.status,403,'Changing OAuth state must invalidate the signed consent');
 const response=await call('/oauth/authorize',{method:'POST',headers:{cookie:authCookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)});
 assert.ok(rateCalls.some(args=>args.p_max===20&&args.p_window===3600000),'OAuth approval must invoke consent rate limiting');
 assert.equal(response.status,302);const returned=new URL(response.headers.get('location'));assert.equal(returned.searchParams.get('iss'),'https://web-ga-demo.onrender.com');const code=returned.searchParams.get('code');assert.ok(code);
 const token=await call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,code_verifier:verifier,client_id:client.client_id,redirect_uri:'https://chatgpt.com/oauth/callback',resource})});
 assert.equal(token.status,200);const creds=await token.json();
 const wrongResource=await call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:creds.refresh_token,resource:'https://other.example/mcp'})});assert.equal(wrongResource.status,400);assert.ok(creds.access_token);assert.ok(creds.refresh_token);
 const mcp=async(name,args={},access=creds.access_token)=>{const resp=await call('/mcp',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});return {status:resp.status,body:await resp.json()}};
 const toolsResponse=await call('/mcp',{method:'POST',headers:{Authorization:'Bearer '+creds.access_token,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})});
 assert.equal(toolsResponse.status,200);const discovered=(await toolsResponse.json()).result.tools;assert.equal(discovered.length,9);assert.ok(!discovered.some(t=>t.name.includes('portfolio_revision')),'portfolio write tools require portfolio:write');assert.ok(discovered.find(t=>t.name==='preview_assessment_batch').inputSchema.properties.assessments.properties.quizzes);
 const listing=await mcp('list_my_resources');assert.equal(listing.status,200);assert.match(listing.body.result.content[0].text,/My class/);assert.doesNotMatch(listing.body.result.content[0].text,/Private other class/);
 const denied=await mcp('get_my_course',{courseId:'e'.repeat(48)});assert.equal(denied.body.error.code,-32004);
 const assessment={assignments:[{title:'Homework',instructions:'Explain the method'}],quizzes:[{title:'Quiz',questions:[{prompt:'Which option is correct?',options:['Incorrect','Correct'],correct:1}]}]};
 const assessmentList=await mcp('preview_assessment_batch',{courseId:cid,assessments:assessment});
 assert.equal(assessmentList.status,200);
 const assessmentPreview=JSON.parse(assessmentList.body.result.content[0].text);
 assert.equal(assessmentPreview.preview,true);
 assert.equal(tables.forma_assignments.length,0);
 const wrongHash=await mcp('create_assessment_batch',{courseId:cid,assessments:assessment,previewHash:'incorrect'});
 assert.equal(wrongHash.body.error.code,-32009);
 const saveArgs={courseId:cid,assessments:assessment,previewHash:assessmentPreview.previewHash};
 const created=await mcp('create_assessment_batch',saveArgs);
 assert.equal(JSON.parse(created.body.result.content[0].text).saved,true);
 assert.equal(tables.forma_assignments.length,1);
 const replay=await mcp('create_assessment_batch',saveArgs);
 assert.equal(JSON.parse(replay.body.result.content[0].text).replayed,true);
 assert.equal(tables.forma_assignments.length,1);
 const noAccess=await mcp('preview_assessment_batch',{courseId:'e'.repeat(48),assessments:assessment});
 assert.equal(noAccess.body.error.code,-32004);
 const refreshed=await call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:creds.refresh_token})});
 assert.equal(refreshed.status,200);const rotated=await refreshed.json();assert.notEqual(rotated.access_token,creds.access_token);
 const stale=await mcp('list_my_resources',{},creds.access_token);assert.equal(stale.status,401);
 const fresh=await mcp('list_my_resources',{},rotated.access_token);assert.equal(fresh.status,200);
 const revoke=await call('/api/connector/revoke',{method:'POST',headers:{cookie:authCookie,'Content-Type':'application/json'},body:JSON.stringify({clientId:client.client_id,confirm:true})});assert.equal(revoke.status,200);
 const after=await mcp('list_my_resources',{},rotated.access_token);assert.equal(after.status,401);
});
