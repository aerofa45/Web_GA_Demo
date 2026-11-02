'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {createApp}=require('../cloud-server');
const {validateOutline}=require('../course');
const uid='a'.repeat(48),cid='c'.repeat(48),pid='d'.repeat(48),token='e'.repeat(48);
const valid=()=>({chapters:[{title:'Chapter',lessons:[{title:'Lesson',type:'text',content:'Explanation'}]}]});
async function setup(t,options={}){
 const tables={forma_sessions:[{tokenhash:crypto.createHash('sha256').update(token).digest('hex'),expires:Date.now()+60000,user_id:uid}],forma_users:[{id:uid}],forma_course_drafts:[{id:cid,user_id:uid,title:'Original',outline:valid()}],forma_course_files:[{id:pid,user_id:uid,course_id:cid,object_key:'private.pdf'}]};
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
