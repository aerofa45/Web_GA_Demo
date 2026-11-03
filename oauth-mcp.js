'use strict';
const crypto=require('node:crypto');
const {validateOutline}=require('./course');
const {sanitize}=require('./profile');
const {validateAssessments}=require('./assessment');
const {URL,URLSearchParams}=require('node:url');
const random=()=>crypto.randomBytes(32).toString('base64url');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const eq=s=>'eq.'+encodeURIComponent(s);
const knownScopes=['portfolio:read','course:read','portfolio:write','course:write'];
function response(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
function problem(status,message){const e=new Error(message);e.status=status;throw e;}
async function body(req,asForm=false,maxBytes=20000){
 let raw='',size=0;for await(const c of req){size+=c.length;if(size>maxBytes)problem(413,'Request too large.');raw+=c.toString();}
 if(asForm)return Object.fromEntries(new URLSearchParams(raw));
 try{return JSON.parse(raw||'{}')}catch{problem(400,'Invalid JSON.')}
}
const isRedirect=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&u.hostname.includes('.')&&s.length<1000}catch{return false}};
function requiredScopes(raw){const list=String(raw||'portfolio:read course:read portfolio:write course:write').split(/\s+/).filter(Boolean);if(!list.length||list.some(x=>!knownScopes.includes(x)))problem(400,'Unsupported scope.');return [...new Set(list)].join(' ')}
function siteOrigin(origin){if(typeof origin!=='string'||!/^https:\/\//.test(origin))problem(503,'Connector origin not configured.');return origin.replace(/\/$/,'')}
function clientRedirect(c,r){return Array.isArray(c.redirect_uris)&&c.redirect_uris.includes(r)}
async function oauthRoutes({req,res,p,method,url,store,current,origin,rate}){
 if(process.env.FORMA_MCP_ENABLED!=='true')return false;
 const site=siteOrigin(origin),issuer=site,resource=site+'/mcp';
 const findClient=async cid=>(await store.rest('forma_oauth_clients','client_id='+eq(cid)+'&select=client_id,client_name,redirect_uris&limit=1'))[0];
 if(p==='/.well-known/oauth-protected-resource'&&method==='GET'){response(res,200,{resource,authorization_servers:[issuer],scopes_supported:knownScopes,bearer_methods_supported:['header']});return true}
 if(p==='/.well-known/oauth-authorization-server'&&method==='GET'){response(res,200,{issuer,authorization_endpoint:site+'/oauth/authorize',token_endpoint:site+'/oauth/token',registration_endpoint:site+'/oauth/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],authorization_response_iss_parameter_supported:true,scopes_supported:knownScopes});return true}
 if(p==='/oauth/register'&&method==='POST'){
  await rate(req,'oauth-register',15,3600000);
  const b=await body(req),uris=b.redirect_uris;
  if(!Array.isArray(uris)||uris.length<1||uris.length>5||uris.some(x=>typeof x!=='string'||!isRedirect(x)))problem(400,'Use one to five valid HTTPS redirect URIs.');
  if(b.token_endpoint_auth_method&&b.token_endpoint_auth_method!=='none')problem(400,'Only public PKCE clients supported.');
  if(b.grant_types&&(!Array.isArray(b.grant_types)||b.grant_types.some(x=>!['authorization_code','refresh_token'].includes(x))))problem(400,'Unsupported grant.');
  const clientId='forma_'+random();
  await store.rest('forma_oauth_clients','','POST',{client_id:clientId,client_name:String(b.client_name||'Connected editing client').slice(0,100),redirect_uris:uris,created:Date.now()});
  response(res,201,{client_id:clientId,client_name:String(b.client_name||'Connected editing client').slice(0,100),redirect_uris:uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']});return true;
 }
 if(p==='/oauth/authorize'&&['GET','POST'].includes(method)){
  const b=method==='GET'?Object.fromEntries(url.searchParams.entries()):await body(req,true);
  const cid=String(b.client_id||''),redirect=String(b.redirect_uri||'');
  const client=await findClient(cid);
  if(!client||!clientRedirect(client,redirect))problem(400,'Unknown OAuth client or redirect URI.');
  if(b.response_type!=='code'||b.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(String(b.code_challenge||''))||!b.state||String(b.state).length>500)problem(400,'OAuth authorization requires a valid state and S256 PKCE challenge.');
  const scopes=requiredScopes(b.scope);
  if(b.resource&&b.resource!==resource)problem(400,'Invalid OAuth resource.');
  const user=await current(req);
  if(!user){res.writeHead(401,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><html><body><h1>Sign in to Forma Studio</h1><p>Sign in to your account in another tab, then reopen this authorization page. No access has been granted.</p><a href="/login?next='+encodeURIComponent('/oauth/authorize'+url.search)+'">Sign in</a></body></html>');return true}
  // Bind the consent form cryptographically to the authenticated account and OAuth request.
  // Browsers may discard the temporary consent cookie during cross-site OAuth redirects.
  // A signed, short-lived form token prevents that from blocking consent without weakening CSRF protection.
  const consentPayload=(data,userId)=>JSON.stringify([userId,data.client_id,data.redirect_uri,data.state,data.code_challenge,data.scope,data.resource||'',data.nonce,data.consent_expires]);
  const consentSignature=(data,userId)=>crypto.createHmac('sha256',store.key).update(consentPayload(data,userId)).digest('base64url');
  if(method==='GET'){
   const nonce=random();b.scope=scopes;b.nonce=nonce;b.consent_expires=String(Date.now()+600000);b.consent_signature=consentSignature(b,user.id);res.setHeader('Set-Cookie','forma_oauth_consent='+nonce+'; Path=/oauth/authorize; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
   const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const inputs=Object.entries({...b,scope:scopes}).filter(([k])=>['client_id','redirect_uri','response_type','code_challenge','code_challenge_method','state','scope','resource','nonce','consent_expires','consent_signature'].includes(k)).map(([k,v])=>'<input type="hidden" name="'+escape(k)+'" value="'+escape(v)+'">').join('');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://chatgpt.com; base-uri 'none'"});
   res.end('<!doctype html><html><head><meta charset="utf-8"><title>Authorize Forma Studio</title></head><body style="font-family:system-ui;max-width:600px;margin:60px auto"><h1>Connect '+escape(client.client_name)+'</h1><p>Signed in as '+escape(user.email)+'. This app requests the following access (write scopes allow editing your content after confirmation): '+escape(scopes)+'. It will only see your own data. It cannot access administrator tools.</p><form method="post" action="/oauth/authorize">'+inputs+'<button type="submit" name="decision" value="approve">Approve access</button> <button type="submit" name="decision" value="deny">Deny</button></form></body></html>');return true;
  }
  const match=String(req.headers.cookie||'').match(/(?:^|;\s*)forma_oauth_consent=([A-Za-z0-9_-]+)/);
  const expected=consentSignature(b,user.id);
  const provided=String(b.consent_signature||'');
  const signed=provided.length===expected.length&&crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected));
  const expires=Number(b.consent_expires);
  if(!signed||!Number.isSafeInteger(expires)||expires<Date.now()||expires>Date.now()+600000||!b.nonce)problem(403,'OAuth consent expired. Reopen authorization.');
  res.setHeader('Set-Cookie','forma_oauth_consent=; Path=/oauth/authorize; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  const go=new URL(redirect);go.searchParams.set('state',b.state);go.searchParams.set('iss',issuer);
  if(b.decision!=='approve'){go.searchParams.set('error','access_denied');res.writeHead(302,{Location:go.toString(),'Cache-Control':'no-store'});res.end();return true}
  await rate(req,'oauth-consent:'+user.id,20,3600000);
  const code=random();await store.rest('forma_oauth_codes','','POST',{code_hash:hash(code),client_id:cid,user_id:user.id,redirect_uri:redirect,challenge:b.code_challenge,scopes,expires:Date.now()+300000,created:Date.now()});
  go.searchParams.set('code',code);res.writeHead(302,{Location:go.toString(),'Cache-Control':'no-store'});res.end();return true;
 }
 if(p==='/oauth/token'&&method==='POST'){
  const b=await body(req,true),cid=String(b.client_id||'');console.info('Forma OAuth token exchange attempted', {grant:b.grant_type||'missing',hasClient:!!cid,hasVerifier:!!b.code_verifier,hasCode:!!b.code,hasResource:!!b.resource});const client=await findClient(cid);if(!client)problem(401,'Unknown OAuth client.');
  if(b.resource&&b.resource!==resource)problem(400,'Invalid OAuth resource audience.');
  if(b.grant_type==='authorization_code'){
   const redirect=String(b.redirect_uri||''),verifier=String(b.code_verifier||''),code=String(b.code||'');
   if(!clientRedirect(client,redirect)||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||!/^[A-Za-z0-9_-]{20,100}$/.test(code))problem(400,'Invalid authorization code request.');
   const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
   const verified=await store.rpc('forma_oauth_consume_code',{p_hash:hash(code),p_client_id:cid,p_redirect_uri:redirect,p_challenge:challenge,p_now:Date.now()});
   if(!verified?.user_id)problem(400,'Authorization code expired or invalid.');
   console.info('Forma OAuth authorization code consumed');
   const access=random(),refresh=random(),now=Date.now();
   await store.rest('forma_oauth_tokens','','POST',{access_hash:hash(access),refresh_hash:hash(refresh),client_id:cid,user_id:verified.user_id,scopes:verified.scopes,expires:now+3600000,refresh_expires:now+2592000000,created:now});
   console.info('Forma OAuth access token issued');response(res,200,{access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:verified.scopes});return true;
  }
  if(b.grant_type==='refresh_token'){
   const previous=String(b.refresh_token||'');
   if(!/^[A-Za-z0-9_-]{20,100}$/.test(previous))problem(400,'Invalid refresh token.');
   await rate(req,'oauth-refresh',100,3600000);
   const access=random(),refresh=random(),now=Date.now();
   const verified=await store.rpc('forma_oauth_rotate_refresh',{p_refresh_hash:hash(previous),p_client_id:cid,p_new_access_hash:hash(access),p_new_refresh_hash:hash(refresh),p_now:now});
   if(!verified?.user_id)problem(401,'Refresh token expired or revoked. Reconnect your account.');
   response(res,200,{access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:verified.scopes});return true;
  }
  problem(400,'Unsupported OAuth grant type.');
 }
 if(p==='/api/connector/revoke'&&method==='POST'){
  const user=await current(req);if(!user)problem(401,'Sign in to revoke connected apps.');
  const b=await body(req);
  if(b.confirm!==true)problem(400,'Confirmation required.');
  const clientId=String(b.clientId||'');
  if(!clientId||clientId.length>200)problem(400,'Specify an OAuth client.');
  await store.rest('forma_oauth_tokens','user_id='+eq(user.id)+'&client_id='+eq(clientId),'DELETE');
  response(res,200,{revoked:true});return true;
 }
 if(p==='/mcp'&&method==='POST'){
  const bearer=/^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(String(req.headers.authorization||''));
  if(!bearer){response(res,401,{error:'OAuth authorization required.'},{'WWW-Authenticate':'Bearer resource_metadata="'+site+'/.well-known/oauth-protected-resource"'});return true}
  const tokens=await store.rest('forma_oauth_tokens','access_hash='+eq(hash(bearer[1]))+'&expires=gt.'+Date.now()+'&select=user_id,scopes&limit=1');
  if(!tokens.length){response(res,401,{error:'Invalid or expired OAuth token.'},{'WWW-Authenticate':'Bearer resource_metadata="'+site+'/.well-known/oauth-protected-resource"'});return true}
  const userId=tokens[0].user_id,scopes=String(tokens[0].scopes||'').split(' ');
  const data=await body(req,false,300000),rpcId=data.id;
  const success=result=>response(res,200,{jsonrpc:'2.0',id:rpcId,result});
  const error=(code,message)=>response(res,200,{jsonrpc:'2.0',id:rpcId,error:{code,message}});
  if(data.method==='initialize'){success({protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'Forma Studio',version:'0.1.0'}});return true}
  if(data.method==='notifications/initialized'){res.writeHead(202);res.end();return true}
  const toolText=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
  const instructor=async()=>Boolean((await store.rest('forma_account_roles','user_id='+eq(userId)+'&role=eq.instructor&select=role&limit=1')).length);
  const courseOwned=async courseId=>{
   if(!/^[a-f0-9]{48}$/.test(String(courseId||'')))problem(400,'Invalid course ID.');
   const record=(await store.rest('forma_course_drafts','id='+eq(courseId)+'&user_id='+eq(userId)+'&select=id,title,outline,published,updated&limit=1'))[0];
   if(!record||record.outline?.archived)problem(404,'This course does not belong to your account.');
   return record;
  };
  const prepareCourse=(title,outline)=>{
   const t=String(title||'').trim().slice(0,140);
   if(!t)problem(400,'Course title required.');
   try{validateOutline(outline)}catch{problem(400,'Invalid course outline or lesson content.');}
   return {title:t,outline};
  };
  const checksum=x=>hash(JSON.stringify(x));
  // Match the shared course validator so MCP clients generate valid lesson payloads.
  const lessonSchema={type:'object',properties:{title:{type:'string',minLength:1,maxLength:180},type:{type:'string',enum:['text','youtube','quiz']},content:{type:'string',maxLength:20000}},required:['title','type','content']};
  const outlineSchema={type:'object',properties:{chapters:{type:'array',maxItems:60,items:{type:'object',properties:{title:{type:'string',minLength:1,maxLength:180},lessons:{type:'array',maxItems:80,items:lessonSchema}},required:['title','lessons']}}},required:['chapters']};
  const assessmentSchema={type:'object',properties:{
   assignments:{type:'array',maxItems:4,items:{type:'object',properties:{title:{type:'string',minLength:1,maxLength:140},instructions:{type:'string',minLength:1,maxLength:10000}},required:['title','instructions']}},
   quizzes:{type:'array',maxItems:4,items:{type:'object',properties:{title:{type:'string',minLength:1,maxLength:140},questions:{type:'array',minItems:1,maxItems:10,items:{type:'object',properties:{prompt:{type:'string',minLength:1,maxLength:1000},options:{type:'array',minItems:2,maxItems:6,items:{type:'string',minLength:1,maxLength:500}},correct:{type:'integer',minimum:0,description:'Zero-based index of the correct option; must be less than options.length.'}},required:['prompt','options','correct']}}},required:['title','questions']}}
  },required:['assignments','quizzes'],description:'Provide both arrays (empty allowed individually, but at least one assessment total). Quiz correct is a zero-based integer index, not answer text.'};
  const definitions=[
   {name:'list_my_resources',description:'List only this connected account’s portfolio and authored courses.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
   {name:'get_my_portfolio',description:'Read the connected account’s portfolio content for proposed edits.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
   {name:'get_my_course',description:'Read a course authored by this account, by ID.',inputSchema:{type:'object',properties:{courseId:{type:'string'}},required:['courseId'],additionalProperties:false}},
   {name:'preview_new_course',description:'Validate a new draft course and return a preview hash. Does not save.',inputSchema:{type:'object',properties:{title:{type:'string'},outline:outlineSchema},required:['title','outline']}},
   {name:'create_course_draft',description:'Create a course as an unpublished draft, after explicit instructor confirmation in ChatGPT. Requires a previewHash from preview_new_course. Never publishes.',inputSchema:{type:'object',properties:{title:{type:'string'},outline:outlineSchema,previewHash:{type:'string'}},required:['title','outline','previewHash']}},
   {name:'preview_course_revision',description:'Preview replacing your course title and complete outline. Returns expectedUpdated and previewHash; does not save.',inputSchema:{type:'object',properties:{courseId:{type:'string'},title:{type:'string'},outline:outlineSchema},required:['courseId','title','outline']}},
   {name:'save_course_revision',description:'Save a previously previewed course revision, after explicit instructor confirmation in ChatGPT. Never changes publication status.',inputSchema:{type:'object',properties:{courseId:{type:'string'},title:{type:'string'},outline:outlineSchema,expectedUpdated:{type:'integer'},previewHash:{type:'string'}},required:['courseId','title','outline','expectedUpdated','previewHash']}},
   {name:'preview_assessment_batch',description:'Preview AI-authored LMS assignments and quiz answer keys for your own course. Nothing is saved.',inputSchema:{type:'object',properties:{courseId:{type:'string'},assessments:assessmentSchema},required:['courseId','assessments']}},
   {name:'create_assessment_batch',description:'After the instructor explicitly confirms the assessment preview in ChatGPT, create the LMS assignments and quizzes atomically. Repeated requests do not duplicate records.',inputSchema:{type:'object',properties:{courseId:{type:'string'},assessments:assessmentSchema,previewHash:{type:'string'}},required:['courseId','assessments','previewHash']}},
   {name:'preview_portfolio_revision',description:'Validate a complete revised portfolio against your account and return a preview hash; no save.',inputSchema:{type:'object',properties:{profile:{type:'object'}},required:['profile']}},
   {name:'save_portfolio_revision',description:'Save complete portfolio only after reviewing the preview and explicit confirmation. Send expectedUpdated and previewHash from preview.',inputSchema:{type:'object',properties:{profile:{type:'object'},expectedUpdated:{type:'integer'},previewHash:{type:'string'}},required:['profile','expectedUpdated','previewHash']}}
  ];
  if(data.method==='tools/list'){success({tools:definitions.filter(x=>x.name==='list_my_resources'||x.name==='get_my_portfolio'&&scopes.includes('portfolio:read')||x.name==='get_my_course'&&scopes.includes('course:read')||x.name.includes('portfolio_revision')&&scopes.includes('portfolio:write')||(['preview_new_course','create_course_draft','preview_course_revision','save_course_revision','preview_assessment_batch','create_assessment_batch'].includes(x.name)&&scopes.includes('course:write')))});return true}
  if(data.method!=='tools/call'){error(-32601,'Unknown MCP method.');return true}
  const name=data.params?.name,args=data.params?.arguments||{};
  if(name==='list_my_resources'){
   const users=await store.rest('forma_users','id='+eq(userId)+'&select=slug&limit=1');if(!users.length){error(-32001,'Account unavailable.');return true}
   const courses=scopes.includes('course:read')?await store.rest('forma_course_drafts','user_id='+eq(userId)+'&select=id,title,published,outline&limit=100'):[];
   success({content:[{type:'text',text:JSON.stringify({portfolio:scopes.includes('portfolio:read')?'/u/'+users[0].slug:null,courses:courses.filter(c=>!c.outline?.archived).map(c=>({id:c.id,title:c.title,published:c.published}))})}]});return true;
  }
  if(name==='get_my_portfolio'&&scopes.includes('portfolio:read')){
   const data=(await store.rest('forma_profiles','user_id='+eq(userId)+'&select=data&limit=1'))[0]?.data;
   success({content:[{type:'text',text:JSON.stringify(data||{})}]});return true;
  }
  if(name==='get_my_course'&&scopes.includes('course:read')){
   if(!/^[a-f0-9]{48}$/.test(String(args.courseId||''))){error(-32602,'Invalid course ID.');return true}
   const owned=(await store.rest('forma_course_drafts','id='+eq(args.courseId)+'&user_id='+eq(userId)+'&select=id,title,outline,published,updated&limit=1'))[0];
   if(!owned||owned.outline?.archived){error(-32004,'Course not found or not owned by connected account.');return true}
   success({content:[{type:'text',text:JSON.stringify(owned)}]});return true;
  }
  if(['preview_new_course','create_course_draft','preview_course_revision','save_course_revision'].includes(name)&&scopes.includes('course:write')){
   if(!await instructor()){error(-32003,'Instructor role required. This user has no administrator access.');return true}
   const proposed=prepareCourse(args.title,args.outline),previewHash=checksum(proposed);
   if(name==='preview_new_course'){success(toolText({preview:true,previewHash,title:proposed.title,chapters:proposed.outline.chapters.length,lessons:proposed.outline.chapters.reduce((n,c)=>n+c.lessons.length,0),published:false}));return true}
   if(name==='create_course_draft'){
    if(args.previewHash!==previewHash){error(-32009,'Course preview mismatch. Preview the exact same content first.');return true}
    await rate(req,'mcp-create-course:'+userId,20,3600000);
    const courseId=crypto.randomBytes(24).toString('hex');
    const created=await store.rpc('forma_assistant_create_course',{p_user_id:userId,p_course_id:courseId,p_title:proposed.title,p_outline:proposed.outline,p_audit_id:crypto.randomBytes(24).toString('hex'),p_now:Date.now()});
    success(toolText({created:created?.created===true,courseId,url:site+'/course/'+courseId,published:false}));return true;
   }
   const owned=await courseOwned(args.courseId);
   if(name==='preview_course_revision'){success(toolText({preview:true,previewHash,expectedUpdated:owned.updated,courseId:owned.id,chapters:proposed.outline.chapters.length,published:owned.published}));return true}
   if(args.previewHash!==previewHash||!Number.isSafeInteger(args.expectedUpdated)){error(-32009,'Preview mismatch or missing version.');return true}
   const result=await store.rpc('forma_assistant_commit',{p_user_id:userId,p_domain:'course',p_resource_id:owned.id,p_expected_updated:args.expectedUpdated,p_content:proposed,p_operation:'mcp-revise-course',p_version_id:crypto.randomBytes(24).toString('hex'),p_audit_id:crypto.randomBytes(24).toString('hex'),p_now:Date.now()});
   if(!result?.saved){error(-32009,'Course changed since preview. Refresh and retry.');return true}
   success(toolText({saved:true,versionId:result.versionId,url:site+'/course/'+owned.id}));return true;
  }
  if(['preview_assessment_batch','create_assessment_batch'].includes(name)&&scopes.includes('course:write')){
   if(!await instructor()){error(-32003,'Instructor role required.');return true}
   if(!/^[a-f0-9]{48}$/.test(String(args.courseId||''))){error(-32602,'Invalid course ID.');return true}
   const owned=(await store.rest('forma_course_drafts','id='+eq(args.courseId)+'&user_id='+eq(userId)+'&select=id,title,outline,published,updated&limit=1'))[0];
   if(!owned||owned.outline?.archived){error(-32004,'Course not found or not owned by connected account.');return true}
   let proposed;
   try{proposed=validateAssessments(args.assessments)}catch(e){error(-32602,'Invalid assignments or quiz content: '+String(e.message||'validation failed'));return true}
   const previewHash=checksum({courseId:owned.id,assessments:proposed});
   if(name==='preview_assessment_batch'){
    success(toolText({preview:true,previewHash,courseId:owned.id,assignments:proposed.assignments,quizzes:proposed.quizzes,note:'Review the exact question answer keys before confirming.'}));return true;
   }
   if(args.previewHash!==previewHash){error(-32009,'Assessment content changed after preview. Preview again.');return true}
   await rate(req,'mcp-assessment-save:'+userId,25,3600000);
   const idFor=(kind,index)=>crypto.createHmac('sha256',store.key).update(userId+':'+previewHash+':'+kind+':'+index).digest('hex').slice(0,48);
   const auditId=idFor('audit',0);
   const assignments=proposed.assignments.map((row,i)=>({...row,id:idFor('a',i)}));
   const quizzes=proposed.quizzes.map((row,i)=>({...row,id:idFor('q',i)}));
   const saved=await store.rpc('forma_assistant_add_assessments',{p_user_id:userId,p_course_id:owned.id,p_assignments:assignments,p_quizzes:quizzes,p_audit_id:auditId,p_now:Date.now()});
   if(!saved?.saved){error(-32009,'Assessment transaction did not commit.');return true}
   success(toolText({saved:true,replayed:Boolean(saved.replayed),courseId:owned.id,assignments:assignments.length,quizzes:quizzes.length,published:false}));return true;
  }
  if(['preview_portfolio_revision','save_portfolio_revision'].includes(name)&&scopes.includes('portfolio:write')){
   const users=await store.rest('forma_users','id='+eq(userId)+'&select=id,name,slug&limit=1');
   if(!users.length){error(-32001,'Account unavailable.');return true}
   const rows=await store.rest('forma_profiles','user_id='+eq(userId)+'&select=data,updated&limit=1');
   if(!rows.length){error(-32004,'Portfolio not found.');return true}
   if(!args.profile||typeof args.profile!=='object'||Array.isArray(args.profile)){error(-32602,'Provide complete portfolio object.');return true}
   const next=sanitize(args.profile,users[0]);
   const previewHash=checksum(next);
   if(name==='preview_portfolio_revision'){success(toolText({preview:true,previewHash,expectedUpdated:rows[0].updated,sections:{experience:next.experience.length,education:next.education.length,research:next.research.length,projects:next.projects.length,publications:next.publications.length}}));return true}
   if(args.previewHash!==previewHash||!Number.isSafeInteger(args.expectedUpdated)){error(-32009,'Portfolio preview mismatch or missing version.');return true}
   const result=await store.rpc('forma_assistant_commit',{p_user_id:userId,p_domain:'portfolio',p_resource_id:userId,p_expected_updated:args.expectedUpdated,p_content:next,p_operation:'mcp-revise-portfolio',p_version_id:crypto.randomBytes(24).toString('hex'),p_audit_id:crypto.randomBytes(24).toString('hex'),p_now:Date.now()});
   if(!result?.saved){error(-32009,'Portfolio changed since preview. Refresh and retry.');return true}
   success(toolText({saved:true,versionId:result.versionId,url:site+'/u/'+users[0].slug}));return true;
  }
  error(-32601,'Unknown or unauthorized tool.');return true;
 }
 if(p==='/mcp'&&method==='GET'){response(res,405,{error:'Use MCP streamable HTTP POST.'});return true}
 return false;
}
module.exports={oauthRoutes};
