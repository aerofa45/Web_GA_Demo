'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {createApp}=require('../cloud-server');
const {validateOutline}=require('../course');
const uid='a'.repeat(48),cid='c'.repeat(48),pid='d'.repeat(48),token='e'.repeat(48);
const valid=()=>({chapters:[{title:'Chapter',lessons:[{title:'Lesson',type:'text',content:'Explanation'}]}]});
async function setup(t,options={}){
 const tables={forma_sessions:[{tokenhash:crypto.createHash('sha256').update(token).digest('hex'),expires:Date.now()+60000,user_id:uid}],forma_users:[{id:uid,email:'teacher@example.com'}],forma_course_drafts:[{id:cid,user_id:uid,title:'Original',outline:valid(),updated:1}],forma_course_files:[{id:pid,user_id:uid,course_id:cid,object_key:'private.pdf'}],forma_course_enrollments:[],forma_drive_video_grants:[],forma_google_connections:[],forma_assignments:[],forma_submissions:[],forma_quizzes:[],forma_quiz_attempts:[],forma_lesson_progress:[],forma_submission_files:[],forma_attendance:[],forma_notifications:[],forma_course_prices:[],forma_test_orders:[],forma_course_subscription_prices:[],forma_test_subscriptions:[],forma_account_roles:[{user_id:uid,role:'instructor'}],forma_assistant_audit:[],forma_assistant_versions:[],forma_profiles:[{user_id:uid,data:{name:'Teacher',experience:[],education:[],research:[],projects:[],publications:[]},updated:1}]};
 const state={calls:[],rates:0,reply:()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(valid())}]}}]})),pdf:Buffer.from('%PDF-1.4 fixture')};
 const store={url:'https://example.supabase.co',key:'fixture',async rpc(name,args){state.rates++;if(name==='forma_assistant_add_assessments'){
   const owned=tables.forma_course_drafts.find(x=>x.id===args.p_course_id&&x.user_id===args.p_user_id&&!x.outline?.archived);
   if(!owned)return {saved:false};
   if(tables.forma_assistant_audit.some(x=>x.id===args.p_audit_id))return {saved:true,replayed:true};
   tables.forma_assignments.push(...structuredClone(args.p_assignments));
   tables.forma_quizzes.push(...structuredClone(args.p_quizzes));
   tables.forma_assistant_audit.push({id:args.p_audit_id,user_id:args.p_user_id,operation:'add-generated-assessments'});
   return {saved:true,assignments:args.p_assignments.length,quizzes:args.p_quizzes.length};
  }
  if(name==='forma_assistant_commit'){
   const target=name&&args.p_domain==='course'?tables.forma_course_drafts.find(x=>x.id===args.p_resource_id&&x.user_id===args.p_user_id):null;
   if(!target||target.updated!==args.p_expected_updated)return {saved:false,conflict:true};
   tables.forma_assistant_versions.push({id:args.p_version_id,user_id:args.p_user_id,domain:'course',resource_id:target.id,created:args.p_now,previous:{title:target.title,outline:structuredClone(target.outline)}});
   target.title=args.p_content.title;target.outline=structuredClone(args.p_content.outline);target.updated=Math.max(args.p_now,target.updated+1);
   return {saved:true,versionId:args.p_version_id};
  }return true;},async rest(table,query='',method='GET',body){const q=new URLSearchParams(query);const matches=r=>[...q].every(([k,v])=>['select','limit','order'].includes(k)||v.startsWith('eq.')&&String(r[k])===decodeURIComponent(v.slice(3))||v.startsWith('gt.')&&r[k]>Number(v.slice(3))||v.startsWith('in.(')&&v.slice(4,-1).split(',').includes(String(r[k])));const rows=tables[table].filter(matches);if(method==='POST'){tables[table].push(structuredClone(body));return null;}if(method==='PATCH'){rows.forEach(r=>Object.assign(r,structuredClone(body)));return null;}if(method==='DELETE'){tables[table]=tables[table].filter(r=>!matches(r));return null;}return structuredClone(rows).map(row=>q.has('select')&&q.get('select')!=='*'?Object.fromEntries(q.get('select').split(',').map(k=>[k,row[k]])):row);}};
 const server=http.createServer(createApp(store,{geminiKey:'fake-test-key',...options,fetcher:async(url,options)=>{state.calls.push({url,options});return state.provider?state.provider(url,options):url.includes('googleapis')?state.reply():new Response(state.pdf);}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 async function req(route,body,authenticated=true,method='POST'){const r=await fetch('http://127.0.0.1:'+server.address().port+route,{method,headers:{'Content-Type':'application/json',...(authenticated?{cookie:'forma_session='+token}:{})},body:method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 return {state,tables,req,serverUrl:'http://127.0.0.1:'+server.address().port};
}
test('outline validation rejects malformed nested output and keeps editable empty drafts',()=>{
 validateOutline({chapters:[]});validateOutline(valid(),{generated:true});
 for(const outline of [{chapters:[]},{chapters:[null]},{chapters:[{title:'C',lessons:[null]}]},{chapters:[{title:'C',lessons:[{title:'L',type:'script',content:'x'}]}]}])assert.throws(()=>validateOutline(outline,{generated:true}));
});
test('text and PDF generation, save and reopen, owner isolation',async t=>{
 const {state,tables,req}=await setup(t);const source='Lecture notes about probability and sampling distributions. '.repeat(3);
 assert.equal((await req('/api/course-generate',{source},false)).status,401);
 assert.equal((await req('/api/course-generate',{source:'short'})).status,400);assert.equal(state.rates,0);
 const text=await req('/api/course-generate',{source});assert.equal(text.status,200);assert.equal(JSON.parse(state.calls.at(-1).options.body).contents[0].parts.length,1);
 assert.equal((await req('/api/course-generate',{courseId:cid,pdfId:pid})).status,200);
 const parts=JSON.parse(state.calls.at(-1).options.body).contents[0].parts;assert.equal(Buffer.from(parts[1].inline_data.data,'base64').toString(),state.pdf.toString());
 const outline=valid();outline.chapters[0].lessons[0].pdfId=pid;outline.chapters.push(...text.body.outline.chapters);
 assert.equal((await req('/api/course-drafts/'+cid,{title:'Saved',outline},true,'PUT')).status,200);
 assert.deepEqual((await req('/api/course-drafts/'+cid,undefined,true,'GET')).body.course.outline,outline);
 tables.forma_course_files[0].user_id='b'.repeat(48);
 assert.equal((await req('/api/course-generate',{courseId:cid,pdfId:pid})).status,404);
 assert.equal((await req('/api/course-drafts/'+cid,{title:'Saved',outline},true,'PUT')).status,400);
 tables.forma_course_drafts[0].user_id='b'.repeat(48);
 assert.equal((await req('/api/course-drafts/'+cid,undefined,true,'GET')).status,404);
});
test('Gemini errors and invalid output are useful and never saved',async t=>{
 const {state,tables,req}=await setup(t),source='Teaching material '.repeat(10),before=structuredClone(tables.forma_course_drafts);
 const cases=[
 [()=>new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED'}}),{status:429}),429,/Gemini (quota|rate)/],
 [()=>new Response('{}',{status:403}),503,/key/],
 [()=>{throw new DOMException('timeout','TimeoutError');},504,/timed out/],
 [()=>new Response('not json'),502,/invalid response/],
 [()=>new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS'}]})),502,/complete/],
 [()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"chapters":[null]}'}]}}]})),502,/invalid outline/]
 ];
 for(const [reply,status,message] of cases){state.reply=reply;const r=await req('/api/course-generate',{source});assert.equal(r.status,status);assert.match(r.body.error,message);}
 assert.deepEqual(tables.forma_course_drafts,before);
});

test('configured Gemini model is used and invalid model paths fail closed',async t=>{
 const source='Teaching material '.repeat(10);
 const custom=await setup(t,{geminiModel:'gemini-test-model'});
 assert.equal((await custom.req('/api/course-generate',{source})).status,200);
 assert.match(custom.state.calls[0].url,/models\/gemini-test-model:generateContent$/);
 const invalid=await setup(t,{geminiModel:'../other?key=bad'});
 assert.equal((await invalid.req('/api/course-generate',{source})).status,503);
 assert.equal(invalid.state.calls.length,0);
});

test('publication exposes only approved public fields and unpublishing revokes anonymous viewing',async t=>{
 const {req,tables}=await setup(t),route='/api/course-drafts/'+cid,view='/api/course-view/'+cid;
 tables.forma_course_drafts[0].published=false;
 tables.forma_course_drafts[0].outline.chapters[0].lessons[0].pdfId=pid;
 assert.equal((await req(view,undefined,false,'GET')).status,404);
 const preview=await req(view,undefined,true,'GET');assert.equal(preview.status,200);assert.equal(preview.body.course.outline.chapters[0].lessons[0].pdfId,pid);
 assert.equal((await req(route,{title:'Published',outline:tables.forma_course_drafts[0].outline,published:true},true,'PUT')).status,200);
 const publicView=await req(view,undefined,false,'GET');assert.equal(publicView.status,200);assert.equal(publicView.body.owner,false);
 assert.equal(publicView.body.course.user_id,undefined);assert.equal(publicView.body.course.outline.chapters[0].lessons[0].pdfId,undefined);
 assert.equal((await req(route,{title:'Empty',outline:{chapters:[]},published:true},true,'PUT')).status,400);
 assert.equal((await req(route,{title:'Empty',outline:{chapters:[]}},true,'PUT')).status,400);
 assert.equal((await req(route,{title:'Draft',outline:valid(),published:false},false,'PUT')).status,401);
 assert.equal((await req(route,{title:'Draft',outline:valid(),published:false},true,'PUT')).status,200);
 assert.equal((await req(view,undefined,false,'GET')).status,404);
});
test('regeneration constrains replacement shape and rejects unsupported targets',async t=>{
 const {req,state}=await setup(t),source='Teaching material '.repeat(10),target=valid().chapters[0];
 const result=await req('/api/course-generate',{source,scope:'lesson',target});assert.equal(result.status,200);
 assert.match(JSON.parse(state.calls.at(-1).options.body).contents[0].parts[0].text,/exactly one chapter with exactly 1 lessons/);
 state.reply=()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({chapters:[{title:'C',lessons:[{title:'Quiz',type:'quiz',content:'Answer'}]}]})}]}}]}));
 assert.equal((await req('/api/course-generate',{source,scope:'lesson',target})).status,502);
 assert.equal((await req('/api/course-generate',{source,scope:'all'})).status,400);
 assert.equal((await req('/api/course-generate',{source,scope:'chapter',target:{title:'Video',lessons:[{title:'Video',type:'youtube',content:'https://youtu.be/dQw4w9WgXcQ'}]}})).status,400);
});

test('course deletion moves to owner-only Trash, revokes publication, and restores intact',async t=>{
 const {req,tables}=await setup(t),route='/api/course-drafts/'+cid,view='/api/course-view/'+cid;
 const original=structuredClone(tables.forma_course_drafts[0].outline);tables.forma_course_drafts[0].published=true;
 assert.equal((await req(route,{},false,'DELETE')).status,401);
 assert.equal((await req(route,{},true,'DELETE')).status,200);
 assert.equal(tables.forma_course_drafts.length,1);assert.equal(tables.forma_course_drafts[0].published,false);
 assert.equal((await req('/api/course-drafts',undefined,true,'GET')).body.courses.length,0);
 assert.equal((await req('/api/course-drafts?archived=true',undefined,true,'GET')).body.courses.length,1);
 assert.equal((await req(view,undefined,false,'GET')).status,404);
 assert.equal((await req(route,undefined,true,'GET')).status,404);
 assert.equal((await req(route,{title:'Old client save',outline:original},true,'PUT')).status,409);
 assert.equal((await req(route+'/restore',{},true,'POST')).status,200);
 assert.deepEqual(tables.forma_course_drafts[0].outline,original);assert.equal(tables.forma_course_drafts[0].published,false);
 assert.equal((await req('/api/course-drafts',undefined,true,'GET')).body.courses.length,1);
 tables.forma_course_drafts[0].user_id='b'.repeat(48);
 assert.equal((await req(route,{},true,'DELETE')).status,404);
 assert.equal((await req(route+'/restore',{},true,'POST')).status,404);
 assert.equal((await req('/api/course-drafts?archived=true',undefined,true,'GET')).body.courses.length,0);
});

test('Drive lesson attachments validate and never appear in public course responses',async t=>{
 const {tables,req}=await setup(t);
 const file={id:'videoFile_123456789',name:'Lecture.mp4',mimeType:'video/mp4'};
 const outline=valid();outline.chapters[0].lessons[0].driveFile=file;
 assert.deepEqual(validateOutline(outline),outline);
 for(const invalid of [{id:'bad',name:'Lecture.mp4',mimeType:'video/mp4'},{id:file.id,name:'',mimeType:'video/mp4'},{id:file.id,name:'Lecture.mp4',mimeType:'text/plain'}]){
   const bad=valid();bad.chapters[0].lessons[0].driveFile=invalid;
   assert.throws(()=>validateOutline(bad));
 }
 assert.throws(()=>validateOutline(outline,{generated:true}));
 tables.forma_course_drafts[0].outline=outline;
 tables.forma_course_drafts[0].published=true;
 const publicView=await req('/api/course-view/'+cid,undefined,false,'GET');
 assert.equal(publicView.status,200);
 assert.equal(publicView.body.course.outline.chapters[0].lessons[0].driveFile,undefined);
 const ownerView=await req('/api/course-drafts/'+cid,undefined,true,'GET');
 assert.deepEqual(ownerView.body.course.outline.chapters[0].lessons[0].driveFile,file);
});

test('private Drive video endpoint denies unauthenticated and unapproved students',async t=>{
 const {tables,req}=await setup(t),file={id:'courseVideo0123456',name:'Private.mp4',mimeType:'video/mp4'};
 tables.forma_course_drafts[0].outline.chapters[0].lessons[0].driveFile=file;
 tables.forma_course_drafts[0].published=true;
 const path='/api/course-video/'+cid+'/0/0';
 assert.equal((await req(path,undefined,false,'GET')).status,401);
 assert.equal((await req(path,undefined,true,'GET')).status,200);
 tables.forma_users.push({id:'b'.repeat(48),email:'student@example.com'});
 tables.forma_sessions[0].user_id='b'.repeat(48);
 assert.equal((await req(path,undefined,true,'GET')).status,403);
 tables.forma_course_enrollments.push({course_id:cid,email:'student@example.com',status:'approved'});
 assert.equal((await req(path,undefined,true,'GET')).status,403);
 tables.forma_drive_video_grants.push({course_id:cid,email:'student@example.com',file_id:file.id,permission_id:'permission1'});
 assert.equal((await req(path,undefined,true,'GET')).status,403);
 tables.forma_google_connections.push({user_id:'b'.repeat(48),role:'student',email:'student@example.com',google_sub:'google_verified_student'});
 assert.equal((await req(path,undefined,true,'GET')).status,200);
 tables.forma_course_enrollments[0].status='revoked';
 assert.equal((await req(path,undefined,true,'GET')).status,403);
});

test('enrollment requests reject an unverified student account',async t=>{
 const {tables,req}=await setup(t);
 tables.forma_course_drafts[0].published=true;
 tables.forma_users.push({id:'b'.repeat(48),email:'student@example.com'});
 tables.forma_sessions[0].user_id='b'.repeat(48);
 const route='/api/course-enrollments/'+cid+'/request';
 assert.equal((await req(route,{})).status,403);
 tables.forma_google_connections.push({user_id:'b'.repeat(48),role:'student',email:'student@example.com',google_sub:'verified'});
 const first=await req(route,{});assert.equal(first.status,200);assert.equal(first.body.status,'pending');
 assert.equal(tables.forma_course_enrollments.length,1);
 assert.equal(tables.forma_course_enrollments[0].email,'student@example.com');
 assert.equal((await req(route,{})).status,200);
 assert.equal(tables.forma_course_enrollments.length,1,'repeat requests must not create duplicates');
 assert.equal((await req('/api/lms/'+cid+'/assignments',undefined,true,'GET')).status,403,'pending students have no course access');
 // Restore instructor session to approve a verified student, then test revocation.
 tables.forma_sessions[0].user_id=uid;
 const decision='/api/course-enrollments/'+cid+'/decision';
 assert.equal((await req(decision,{email:'student@example.com',decision:'approve'})).status,200);
 assert.equal(tables.forma_course_enrollments[0].status,'approved');
 tables.forma_sessions[0].user_id='b'.repeat(48);
 assert.equal((await req('/api/lms/'+cid+'/assignments',undefined,true,'GET')).status,200);
 assert.equal((await req(route,{})).body.status,'approved');
 tables.forma_sessions[0].user_id=uid;
 assert.equal((await req(decision,{email:'student@example.com',decision:'revoke'})).status,200);
 assert.equal(tables.forma_course_enrollments[0].status,'revoked');
 tables.forma_sessions[0].user_id='b'.repeat(48);
 assert.equal((await req(route,{})).status,403,'revoked students cannot request access again');
 assert.equal((await req('/api/lms/'+cid+'/assignments',undefined,true,'GET')).status,403);
});

test('LMS denies unapproved access and permits instructor to view empty gradebook',async t=>{
 const {tables,req}=await setup(t);
 assert.equal((await req('/api/lms/'+cid+'/assignments',undefined,false,'GET')).status,401);
 assert.equal((await req('/api/lms/'+cid+'/assignments',undefined,true,'GET')).status,200);
 assert.equal((await req('/api/lms/'+cid+'/gradebook',undefined,true,'GET')).status,200);
 assert.equal((await req('/api/lms/'+cid+'/submissions',{assignmentId:'x',content:'text'})).status,403);
 tables.forma_users.push({id:'b'.repeat(48),email:'student@example.com'});tables.forma_sessions[0].user_id='b'.repeat(48);
 assert.equal((await req('/api/lms/'+cid+'/assignments',undefined,true,'GET')).status,403);
 tables.forma_course_drafts[0].published=true;
 tables.forma_course_enrollments.push({course_id:cid,email:'student@example.com',status:'approved'});
 assert.equal((await req('/api/lms/'+cid+'/assignments',undefined,true,'GET')).status,200);
 assert.equal((await req('/api/lms/'+cid+'/assignments',{title:'Unauthorized',maxPoints:100})).status,403);
});

test('LMS rejects unauthenticated gradebook and student file access without enrollment',async t=>{
 const {tables,req}=await setup(t);
 const root='/api/lms/'+cid;
 assert.equal((await req(root+'/gradebook',undefined,false,'GET')).status,401);
 assert.equal((await req(root+'/submission-file?assignmentId=x&studentId=y',undefined,false,'GET')).status,401);
 tables.forma_users.push({id:'b'.repeat(48),email:'student@example.com'});
 tables.forma_sessions[0].user_id='b'.repeat(48);
 tables.forma_course_drafts[0].published=true;
 assert.equal((await req(root+'/submission-file?assignmentId=x',undefined,true,'GET')).status,403);
 assert.equal((await req(root+'/gradebook',undefined,true,'GET')).status,403);
 tables.forma_course_enrollments.push({course_id:cid,email:'student@example.com',status:'approved'});
 assert.equal((await req(root+'/submission-file?assignmentId=x',undefined,true,'GET')).status,404);
});

test('LMS attendance and late-policy endpoints restrict access and validate data',async t=>{
 const {tables,req}=await setup(t);
 const root='/api/lms/'+cid;
 assert.equal((await req(root+'/attendance',{date:'2026-11-02',studentId:'b'.repeat(48),status:'present'})).status,404);
 assert.equal((await req(root+'/assignments',{title:'HW',maxPoints:100,lateMinutes:-1})).status,400);
 assert.equal((await req(root+'/assignments',{title:'HW',maxPoints:100,latePenaltyPercent:101})).status,400);
 assert.equal((await req(root+'/notifications',undefined,false,'GET')).status,401);
 assert.equal((await req(root+'/notifications',undefined,true,'GET')).status,200);
 tables.forma_users.push({id:'b'.repeat(48),email:'student@example.com'});
 tables.forma_sessions[0].user_id='b'.repeat(48);
 tables.forma_course_drafts[0].published=true;
 tables.forma_course_enrollments.push({course_id:cid,email:'student@example.com',status:'approved'});
 assert.equal((await req(root+'/attendance',{date:'2026-11-02',studentId:'b'.repeat(48),status:'present'})).status,403);
 assert.equal((await req(root+'/attendance',undefined,true,'GET')).status,200);
});

test('sandbox subscription endpoints deny unconfigured checkout and isolate student status',async t=>{
 const {tables,req}=await setup(t);
 assert.equal((await req('/api/stripe-test/subscription-checkout',{courseId:cid},false)).status,503);
 const status=await req('/api/stripe-test/subscription-status?courseId='+cid,undefined,true,'GET');
 assert.equal(status.status,200);assert.equal(status.body.status,'none');
 tables.forma_test_subscriptions.push({id:'order',course_id:cid,student_id:'b'.repeat(48),status:'active',updated:Date.now()});
 assert.equal((await req('/api/stripe-test/subscription-status?courseId='+cid,undefined,true,'GET')).body.status,'none');
});

test('sandbox subscription pricing is owner-only and student status stays private',async t=>{
 const {tables,req}=await setup(t),route='/api/stripe-test/subscription-price/'+cid;
 assert.equal((await req(route,undefined,false,'GET')).status,401);
 assert.equal((await req(route,undefined,true,'GET')).status,200);
 tables.forma_users.push({id:'b'.repeat(48),email:'student@example.com'});
 tables.forma_sessions[0].user_id='b'.repeat(48);
 assert.equal((await req(route,undefined,true,'GET')).status,404);
 assert.equal((await req(route,{amountCents:1000,interval:'month',enabled:true})).status,404);
 assert.equal((await req('/api/stripe-test/subscription-checkout',{courseId:cid})).status,503);
 tables.forma_test_subscriptions.push({id:'order',course_id:cid,student_id:uid,status:'active',updated:Date.now()});
 assert.equal((await req('/api/stripe-test/subscription-status?courseId='+cid,undefined,true,'GET')).body.status,'none');
});

test('assistant editing prevents students from changing instructor courses and blocks unauthenticated edits',async t=>{
 const {tables,req}=await setup(t);
 assert.equal((await req('/api/course-edit',{courseId:cid,operation:'add-chapter',title:'Unauthorized'},false)).status,401);
 tables.forma_account_roles[0].role='student';
 assert.equal((await req('/api/course-edit',{courseId:cid,operation:'add-chapter',title:'Unauthorized'})).status,403);
});

test('AI-generated course is previewed, saved atomically, versioned and restored by its owner',async t=>{
 const {req,tables}=await setup(t);
 const old=structuredClone(tables.forma_course_drafts[0].outline);
 const newOutline={chapters:[{title:'Generated unit',lessons:[{title:'Probability fundamentals',type:'text',content:'A grounded explanation'}]}]};
 const route='/api/assistant/course-generation/commit';
 const args={courseId:cid,title:'AI course',outline:newOutline,expectedUpdated:1,confirm:true};
 assert.equal((await req(route,{...args,confirm:false})).status,400);
 assert.equal((await req(route,args,false)).status,401);
 const preview=await req('/api/course-generate',{source:'Probability and statistics teaching notes. '.repeat(4)});
 assert.equal(preview.status,200);
 assert.equal(tables.forma_course_drafts[0].title,'Original','generation must not save');
 assert.equal((await req(route,{...args,expectedUpdated:2})).status,409);
 const saved=await req(route,args);assert.equal(saved.status,200);assert.equal(saved.body.saved,true);
 assert.equal(tables.forma_course_drafts[0].title,'AI course');
 assert.deepEqual(tables.forma_course_drafts[0].outline,newOutline);
 assert.equal(tables.forma_assistant_versions.length,1);
 const versionId=tables.forma_assistant_versions[0].id;
 assert.equal((await req('/api/assistant/version/'+versionId,undefined,false,'GET')).status,401);
 const snapshot=await req('/api/assistant/version/'+versionId,undefined,true,'GET');
 assert.equal(snapshot.status,200);assert.deepEqual(snapshot.body.version.previous.outline,old);
 const stale=await req('/api/assistant/restore',{versionId,expectedUpdated:1,confirm:true});
 assert.equal(stale.status,409);
 const restore=await req('/api/assistant/restore',{versionId,expectedUpdated:snapshot.body.expectedUpdated,confirm:true});
 assert.equal(restore.status,200);
 assert.equal(tables.forma_course_drafts[0].title,'Original');
 assert.deepEqual(tables.forma_course_drafts[0].outline,old);
 assert.equal(tables.forma_assistant_versions.length,2,'restore must be reversible');
});
test('student cannot save generated courses or read and restore instructor snapshots',async t=>{
 const {req,tables}=await setup(t);
 tables.forma_assistant_versions.push({id:'f'.repeat(48),user_id:uid,domain:'course',resource_id:cid,previous:{title:'Earlier',outline:valid()},created:Date.now()});
 tables.forma_users.push({id:'b'.repeat(48),email:'student@example.com'});
 tables.forma_sessions[0].user_id='b'.repeat(48);
 assert.equal((await req('/api/assistant/course-generation/commit',{courseId:cid,title:'Not mine',outline:valid(),expectedUpdated:1})).status,403);
 assert.equal((await req('/api/assistant/version/'+'f'.repeat(48),undefined,true,'GET')).status,404);
 assert.equal((await req('/api/assistant/restore',{versionId:'f'.repeat(48),expectedUpdated:1,confirm:true})).status,404);
});

test('assessment validator accepts bounded questions and rejects unsafe shapes',()=>{
 const {validateAssessments}=require('../assessment');
 const validInput={assignments:[{title:' Unit A ',instructions:' Analyze example data. '}],quizzes:[{title:'Review',questions:[{prompt:'2+2?',options:['3','4'],correct:1}]}]};
 assert.deepEqual(validateAssessments(validInput).quizzes[0].questions[0].options,['3','4']);
 assert.throws(()=>validateAssessments({assignments:[],quizzes:[]}));
 assert.throws(()=>validateAssessments({assignments:[],quizzes:[{title:'Q',questions:[{prompt:'X',options:['A','B'],correct:2}]}]}));
 assert.throws(()=>validateAssessments({assignments:[{title:'A',instructions:'B'}],quizzes:[{title:'Q',questions:[{prompt:'X',options:['A','B'],correct:'1'}]}]}));
 assert.throws(()=>validateAssessments({assignments:Array(5).fill({title:'A',instructions:'B'}),quizzes:[]}));
});
test('AI assessment preview never persists and confirmed save is idempotent and access-scoped',async t=>{
 const {req,state,tables}=await setup(t);
 const source={assignments:[{title:'Practice assignment',instructions:'Use Bayes theorem to solve a numerical problem.'}],quizzes:[{title:'Probability quiz',questions:[{prompt:'Which is a probability?',options:['-1','0.5','2'],correct:1}]}]};
 state.reply=()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(source)}]}}]}));
 const route='/api/assistant/assessment-generation',notes='Detailed probability distribution and Bayes theorem concepts. '.repeat(3);
 assert.equal((await req(route,{courseId:cid,notes},false)).status,401);
 const preview=await req(route,{courseId:cid,notes});assert.equal(preview.status,200);
 assert.equal(preview.body.assessments.assignments.length,1);
 assert.equal(tables.forma_assignments.length,0);
 assert.equal(tables.forma_quizzes.length,0);
 const commitRoute=route+'/commit',payload={courseId:cid,assessments:preview.body.assessments,previewToken:preview.body.previewToken,confirm:true};
 assert.equal((await req(commitRoute,{...payload,confirm:false})).status,400);
 assert.equal((await req(commitRoute,{...payload,previewToken:'f'.repeat(64)})).status,409);
 const ok=await req(commitRoute,payload);assert.equal(ok.status,200);assert.equal(ok.body.saved,true);
 assert.equal(tables.forma_assignments.length,1);assert.equal(tables.forma_quizzes.length,1);
 const replay=await req(commitRoute,payload);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);
 assert.equal(tables.forma_assignments.length,1);assert.equal(tables.forma_quizzes.length,1);
 tables.forma_users.push({id:'b'.repeat(48),email:'student@example.com'});tables.forma_sessions[0].user_id='b'.repeat(48);
 assert.equal((await req(route,{courseId:cid,notes})).status,403);
 assert.equal((await req(commitRoute,payload)).status,403);
});
test('generation confirmation rejects published courses without unpublishing',async t=>{
 const {req,tables}=await setup(t);
 tables.forma_course_drafts[0].published=true;
 assert.equal((await req('/api/assistant/course-generation/commit',{courseId:cid,title:'Generated',outline:valid(),expectedUpdated:1,confirm:true})).status,409);
 assert.equal(tables.forma_course_drafts[0].title,'Original');
});

test('assistant interpretation receives bounded conversation history without saving changes',async t=>{
 const {req,state,tables}=await setup(t);
 state.reply=()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({section:'experience',operation:'add',entry:{title:'Research assistant',subtitle:'',description:'ECG work'}})}]}}]}));
 const history=Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:'Earlier message '+i}));
 const result=await req('/api/assistant/interpret',{domain:'portfolio',request:'Add a research assistant role to my portfolio.',history});
 assert.equal(result.status,200);assert.equal(result.body.suggestion.operation,'add');
 const upstream=JSON.parse(state.calls.at(-1).options.body).contents[0].parts[0].text;
 assert.match(upstream,/Earlier message 11/);
 assert.doesNotMatch(upstream,/Earlier message 0/);
 assert.equal(tables.forma_assistant_versions.length,0);
 assert.equal(tables.forma_assistant_audit.length,0);
});

test('published course preserves saved theme without leaking attachment identifiers',async t=>{
 const {tables,req}=await setup(t);const course=tables.forma_course_drafts[0];course.published=true;
 for(const theme of ['midnight','daylight','forest']){
  course.outline.theme=theme;course.outline.chapters[0].lessons[0].driveFile={id:'private-video-123',name:'Private',mimeType:'video/mp4'};
  const view=await req('/api/course-view/'+cid,undefined,false,'GET');assert.equal(view.status,200);assert.equal(view.body.course.outline.theme,theme);
  assert.equal(view.body.course.outline.chapters[0].lessons[0].hasDriveVideo,true);
  assert.doesNotMatch(JSON.stringify(view.body),/private-video-123|private.pdf/);
 }
});

function providerEnvironment(t){
 const vars={STRIPE_TEST_SECRET_KEY:'sk_test_fixture',STRIPE_TEST_WEBHOOK_SECRET:'whsec_fixture',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GOOGLE_TOKEN_ENCRYPTION_KEY:'1'.repeat(64)};
 const before=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]]));Object.assign(process.env,vars);
 t.after(()=>{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(vars.GOOGLE_TOKEN_ENCRYPTION_KEY,'hex'),iv);
 const encrypted=Buffer.concat([cipher.update('fixture-refresh','utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
}
async function webhook(serverUrl,type,object,{valid=true,age=0}={}){
 const raw=JSON.stringify({id:'evt_fixture',type,data:{object}}),timestamp=String(Math.floor(Date.now()/1000)-age);
 const sig=crypto.createHmac('sha256',valid?'whsec_fixture':'wrong').update(timestamp+'.'+raw).digest('hex');
 const r=await fetch(serverUrl+'/api/stripe-test/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':'t='+timestamp+',v1='+sig},body:raw});
 return {status:r.status,body:await r.json()};
}
function studentFixture(tables){
 const student='b'.repeat(48);tables.forma_users.push({id:student,email:'student@example.com'});
 tables.forma_course_drafts[0].published=true;
 tables.forma_google_connections.push({user_id:student,role:'student',email:'student@example.com',google_sub:'fixture-sub'});
 tables.forma_course_enrollments.push({course_id:cid,email:'student@example.com',status:'pending'});return student;
}
test('signed Stripe payment validates signature, amount, mode, replay and keeps approval separate',async t=>{
 providerEnvironment(t);const {tables,serverUrl}=await setup(t);const student=studentFixture(tables),order='f'.repeat(48);
 tables.forma_test_orders.push({id:order,course_id:cid,student_id:student,checkout_session_id:'cs_test_fixture',status:'pending',amount_cents:500,currency:'usd'});
 const paid={id:'cs_test_fixture',livemode:false,payment_status:'paid',currency:'usd',amount_total:500,metadata:{order_id:order}};
 assert.equal((await webhook(serverUrl,'checkout.session.completed',paid,{valid:false})).status,400);
 assert.equal((await webhook(serverUrl,'checkout.session.completed',paid,{age:601})).status,400);
 assert.equal((await webhook(serverUrl,'checkout.session.completed',{...paid,livemode:true})).status,200);
 assert.equal(tables.forma_test_orders[0].status,'pending');
 assert.equal((await webhook(serverUrl,'checkout.session.completed',{...paid,amount_total:1})).status,400);
 for(let n=0;n<2;n++)assert.equal((await webhook(serverUrl,'checkout.session.completed',paid)).status,200);
 assert.equal(tables.forma_test_orders[0].status,'paid');assert.equal(tables.forma_course_enrollments[0].status,'pending');
});
test('paid enrollment gates approval and Drive permission failures deny access until retry',async t=>{
 const refresh_cipher=providerEnvironment(t);const {tables,state,req}=await setup(t);const student=studentFixture(tables);
 tables.forma_course_prices.push({course_id:cid,enabled:true,amount_cents:500});
 const decision='/api/course-enrollments/'+cid+'/decision';
 assert.equal((await req(decision,{email:'student@example.com',decision:'approve'})).status,402);
 tables.forma_test_orders.push({id:'f'.repeat(48),course_id:cid,student_id:student,status:'paid'});
 const file='fixture-video-123';tables.forma_course_drafts[0].outline.chapters[0].lessons[0].driveFile={id:file,name:'Private lesson',mimeType:'video/mp4'};
 tables.forma_google_connections.push({user_id:uid,role:'instructor',refresh_cipher});
 let fail=true,deleted=0;state.provider=async(url,opts)=>{
  if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'fixture-access'});
  if(opts.method==='POST')return fail?new Response('{}',{status:403}):Response.json({id:'permission-fixture'});
  if(opts.method==='DELETE'){deleted++;return new Response(null,{status:204});}
  throw Error('Unexpected provider request');
 };
 assert.equal((await req(decision,{email:'student@example.com',decision:'approve'})).status,502);
 assert.equal(tables.forma_course_enrollments[0].status,'pending');assert.equal(tables.forma_drive_video_grants.length,0);
 fail=false;assert.equal((await req(decision,{email:'student@example.com',decision:'approve'})).status,200);
 assert.equal(tables.forma_drive_video_grants.length,1);
 tables.forma_sessions[0].user_id=student;assert.equal((await req('/api/course-video/'+cid+'/0/0',undefined,true,'GET')).status,200);
 tables.forma_sessions[0].user_id=uid;assert.equal((await req(decision,{email:'student@example.com',decision:'revoke'})).status,200);
 assert.equal(deleted,1);assert.equal(tables.forma_drive_video_grants.length,0);
 tables.forma_sessions[0].user_id=student;assert.equal((await req('/api/course-video/'+cid+'/0/0',undefined,true,'GET')).status,403);
});
test('full refund revokes LMS immediately and retries failed Drive removal idempotently',async t=>{
 const refresh_cipher=providerEnvironment(t);const {tables,state,req,serverUrl}=await setup(t);const student=studentFixture(tables);
 tables.forma_course_enrollments[0].status='approved';
 tables.forma_test_orders.push({id:'f'.repeat(48),course_id:cid,student_id:student,checkout_session_id:'cs_test_fixture',status:'paid'});
 tables.forma_drive_video_grants.push({course_id:cid,email:'student@example.com',file_id:'fixture-video-123',permission_id:'permission-fixture'});
 tables.forma_google_connections.push({user_id:uid,role:'instructor',refresh_cipher});
 let fail=true,removed=0;state.provider=async(url,opts)=>{
  if(url.includes('api.stripe.com'))return Response.json({data:[{id:'cs_test_fixture',livemode:false}]});
  if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'fixture-access'});
  if(opts.method==='DELETE'){removed++;return fail?new Response('{}',{status:503}):new Response(null,{status:204});}
  throw Error('Unexpected provider request');
 };
 const charge={livemode:false,payment_intent:'pi_fixture',refunded:true};
 assert.equal((await webhook(serverUrl,'charge.refunded',{...charge,refunded:false})).status,200);assert.equal(tables.forma_test_orders[0].status,'paid');
 assert.equal((await webhook(serverUrl,'charge.refunded',charge)).status,502);
 assert.equal(tables.forma_test_orders[0].status,'refunded');assert.equal(tables.forma_course_enrollments[0].status,'revoked');assert.equal(tables.forma_drive_video_grants.length,1);
 tables.forma_sessions[0].user_id=student;assert.equal((await req('/api/lms/'+cid+'/assignments',undefined,true,'GET')).status,403);
 fail=false;for(let n=0;n<2;n++)assert.equal((await webhook(serverUrl,'charge.refunded',charge)).status,200);
 assert.equal(tables.forma_drive_video_grants.length,0);assert.equal(removed,2);
});
test('refund preserves another paid entitlement and a Drive share needed by another course',async t=>{
 const refresh_cipher=providerEnvironment(t);const {tables,state,serverUrl}=await setup(t);const student=studentFixture(tables);tables.forma_course_enrollments[0].status='approved';
 tables.forma_test_orders.push({id:'1'.repeat(48),course_id:cid,student_id:student,checkout_session_id:'cs_test_fixture',status:'paid'},{id:'2'.repeat(48),course_id:cid,student_id:student,checkout_session_id:'cs_test_second',status:'paid'});
 tables.forma_drive_video_grants.push({course_id:cid,email:'student@example.com',file_id:'fixture-video-123',permission_id:'permission-fixture'},{course_id:'9'.repeat(48),email:'student@example.com',file_id:'fixture-video-123',permission_id:'permission-fixture'});
 tables.forma_google_connections.push({user_id:uid,role:'instructor',refresh_cipher});
 state.provider=async(url)=>{
  if(url.includes('api.stripe.com'))return Response.json({data:[{id:'cs_test_fixture',livemode:false}]});
  if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'fixture-access'});
  throw Error('Shared permission must not be removed');
 };
 const charge={livemode:false,payment_intent:'pi_fixture',refunded:true};assert.equal((await webhook(serverUrl,'charge.refunded',charge)).status,200);
 assert.equal(tables.forma_course_enrollments[0].status,'approved');assert.equal(tables.forma_drive_video_grants.length,2);
 tables.forma_test_orders[1].status='refunded';assert.equal((await webhook(serverUrl,'charge.refunded',charge)).status,200);
 assert.equal(tables.forma_course_enrollments[0].status,'revoked');assert.equal(tables.forma_drive_video_grants.length,1);assert.equal(tables.forma_drive_video_grants[0].course_id,'9'.repeat(48));
});
