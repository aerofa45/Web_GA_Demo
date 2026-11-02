'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {createApp}=require('../cloud-server');
const {validateOutline}=require('../course');
const uid='a'.repeat(48),cid='c'.repeat(48),pid='d'.repeat(48),token='e'.repeat(48);
const valid=()=>({chapters:[{title:'Chapter',lessons:[{title:'Lesson',type:'text',content:'Explanation'}]}]});
async function setup(t,options={}){
 const tables={forma_sessions:[{tokenhash:crypto.createHash('sha256').update(token).digest('hex'),expires:Date.now()+60000,user_id:uid}],forma_users:[{id:uid,email:'teacher@example.com'}],forma_course_drafts:[{id:cid,user_id:uid,title:'Original',outline:valid()}],forma_course_files:[{id:pid,user_id:uid,course_id:cid,object_key:'private.pdf'}],forma_course_enrollments:[],forma_drive_video_grants:[],forma_google_connections:[],forma_assignments:[],forma_submissions:[],forma_quizzes:[],forma_quiz_attempts:[],forma_lesson_progress:[],forma_submission_files:[],forma_attendance:[],forma_notifications:[],forma_course_subscription_prices:[],forma_test_subscriptions:[]};
 const state={calls:[],rates:0,reply:()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(valid())}]}}]})),pdf:Buffer.from('%PDF-1.4 fixture')};
 const store={url:'https://example.supabase.co',key:'fixture',async rpc(){state.rates++;return true;},async rest(table,query='',method='GET',body){const q=new URLSearchParams(query);const matches=r=>[...q].every(([k,v])=>['select','limit','order'].includes(k)||v.startsWith('eq.')&&String(r[k])===decodeURIComponent(v.slice(3))||v.startsWith('gt.')&&r[k]>Number(v.slice(3)));const rows=tables[table].filter(matches);if(method==='PATCH'){rows.forEach(r=>Object.assign(r,structuredClone(body)));return null;}return structuredClone(rows).map(row=>q.has('select')&&q.get('select')!=='*'?Object.fromEntries(q.get('select').split(',').map(k=>[k,row[k]])):row);}};
 const server=http.createServer(createApp(store,{geminiKey:'fake-test-key',...options,fetcher:async(url,options)=>{state.calls.push({url,options});return url.includes('googleapis')?state.reply():new Response(state.pdf);}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 async function req(route,body,authenticated=true,method='POST'){const r=await fetch('http://127.0.0.1:'+server.address().port+route,{method,headers:{'Content-Type':'application/json',...(authenticated?{cookie:'forma_session='+token}:{})},body:method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 return {state,tables,req};
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
 [()=>new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED'}}),{status:429}),429,/Gemini rate/],
 [()=>new Response('{}',{status:403}),502,/key/],
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
 // The mock database in setup does not yet support INSERT; existing enrollment requests are updated in production.
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
