'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const sharp=require('sharp');
const {createApp,createStore}=require('../cloud-server');

function memoryStore(){
  const tables=Object.fromEntries(['users','profiles','sessions','messages','uploads','limits','account_roles'].map(n=>['forma_'+n,[]]));
  return {url:'https://example.supabase.co',key:'unit-test-key',tables,objects:[],
    async rest(table,query='',method='GET',body){
      const q=new URLSearchParams(query);
      const matches=row=>[...q].every(([key,value])=>['select','order','limit'].includes(key)||value.startsWith('eq.')&&String(row[key])===value.slice(3)||value.startsWith('gt.')&&row[key]>Number(value.slice(3)));
      if(method==='POST'){tables[table].push(structuredClone(body));return null;}
      if(method==='PATCH'){tables[table].filter(matches).forEach(row=>Object.assign(row,structuredClone(body)));return null;}
      if(method==='DELETE'){tables[table]=tables[table].filter(row=>!matches(row));return null;}
      let rows=tables[table].filter(matches).map(row=>structuredClone(row));
      if(q.has('order'))rows.sort((a,b)=>b.created-a.created);
      if(q.has('limit'))rows=rows.slice(0,Number(q.get('limit')));
      if(q.has('select')&&q.get('select')!=='*')rows=rows.map(row=>Object.fromEntries(q.get('select').split(',').map(k=>[k,row[k]])));
      return rows;
    },
    async rpc(name,b){
      if(name==='forma_limit')return true;
      if(name==='forma_reserve_upload'){if(tables.forma_uploads.filter(r=>r.user_id===b.p_user).length>=30)return false;tables.forma_uploads.push({id:b.p_id,user_id:b.p_user});return true;}
      if(name==='forma_register'){
        if(tables.forma_users.some(u=>u.email===b.p_user.email||u.slug===b.p_user.slug)){const e=new Error('Already registered');e.status=409;throw e;}
        tables.forma_users.push(b.p_user);tables.forma_profiles.push({user_id:b.p_user.id,data:b.p_profile});tables.forma_sessions.push({tokenhash:b.p_token,user_id:b.p_user.id,expires:b.p_expires});return null;
      }
      throw Error('Unexpected RPC');
    },
    async upload(name,bytes){this.objects.push({name,bytes});return {};}
  };
}

test('cloud beta account, ownership, image, and payment boundaries',async t=>{
  const store=memoryStore();const server=http.createServer(createApp(store,{origin:'http://forma.test'}));server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function request(route,{method='GET',body,cookie,origin}={}){const res=await fetch(base+route,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});const raw=await res.text();return {status:res.status,headers:res.headers,body:res.headers.get('content-type')?.includes('application/json')?JSON.parse(raw):raw};}
  const registration=slug=>request('/api/register',{method:'POST',body:{name:slug,email:slug+'@example.test',slug,password:'unique-test-password-123'}});
  let alice,bob,aliceCookie,bobCookie;
  try{
    await t.test('registers without exposing private sign-in email in public profile',async()=>{
      alice=await registration('alice');bob=await registration('bob');assert.equal(alice.status,201);assert.equal(bob.status,201);aliceCookie=alice.headers.get('set-cookie').split(';')[0];bobCookie=bob.headers.get('set-cookie').split(';')[0];
      assert.match(alice.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);assert.equal(alice.body.profile.email,'');assert.notEqual(store.tables.forma_users[0].passhash,'unique-test-password-123');
      const pub=await request('/api/public/alice');assert.equal(pub.body.profile.email,'');assert.equal(pub.body.user,undefined);
    });
    await t.test('only authenticated owner can save and owner IDs in submitted content are ignored',async()=>{
      assert.equal((await request('/api/profile',{method:'PUT',body:{}})).status,401);
      const saved=await request('/api/profile',{method:'PUT',cookie:aliceCookie,body:{...alice.body.profile,name:'Alice updated',user_id:bob.body.user.id}});assert.equal(saved.status,200);
      assert.equal((await request('/api/public/alice')).body.profile.name,'Alice updated');assert.equal((await request('/api/public/bob')).body.profile.name,'bob');
    });
    await t.test('contact inbox is private and scoped to recipient',async()=>{
      assert.equal((await request('/api/contact/alice',{method:'POST',body:{sender:'Visitor',email:'visitor@example.test',message:'Hello Alice'}})).status,201);
      assert.equal((await request('/api/messages')).status,401);assert.equal((await request('/api/messages',{cookie:aliceCookie})).body.messages.length,1);assert.equal((await request('/api/messages',{cookie:bobCookie})).body.messages.length,0);
    });
    await t.test('rejects cross-origin saves and payments, callbacks, private lessons, and video uploads',async()=>{
      assert.equal((await request('/api/profile',{method:'PUT',cookie:aliceCookie,origin:'https://evil.test',body:{}})).status,403);
      for(const route of ['/api/withdrawals','/api/courses/abc/checkout','/api/stripe/webhook','/api/esewa/return','/api/media','/api/course-video'])assert.equal((await request(route,{method:'POST',cookie:aliceCookie,body:{}})).status,403);
    });
    await t.test('validates and persists decoded images with an account quota',async()=>{
      assert.equal((await request('/api/images',{method:'POST',cookie:aliceCookie,body:{data:'data:image/png;base64,bm90YW5pbWFnZQ=='}})).status,400);
      const png=await sharp({create:{width:20,height:20,channels:3,background:'#123456'}}).png().toBuffer();
      const image=await request('/api/images',{method:'POST',cookie:aliceCookie,body:{data:'data:image/png;base64,'+png.toString('base64')}});assert.equal(image.status,201);assert.match(image.body.url,/\/forma-images\//);assert.equal((await sharp(store.objects[0].bytes).metadata()).format,'webp');
      while(store.tables.forma_uploads.length<30)store.tables.forma_uploads.push({user_id:alice.body.user.id});assert.equal((await request('/api/images',{method:'POST',cookie:aliceCookie,body:{data:'data:image/png;base64,'+png.toString('base64')}})).status,409);
    });
    await t.test('login, session expiry and logout are enforced',async()=>{
      assert.equal((await request('/api/login',{method:'POST',body:{email:'alice@example.test',password:'wrong'}})).status,401);
      const login=await request('/api/login',{method:'POST',body:{email:'alice@example.test',password:'unique-test-password-123'}});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await request('/api/me',{cookie})).body.user.slug,'alice');
      assert.equal((await request('/api/logout',{method:'POST',cookie,body:{}})).status,200);assert.equal((await request('/api/me',{cookie})).body.user,null);
      store.tables.forma_sessions.forEach(s=>s.expires=0);assert.equal((await request('/api/me',{cookie:aliceCookie})).body.user,null);
    });
    await t.test('public pages have metadata and server does not expose secrets or unknown files',async()=>{
      const page=await request('/u/alice');assert.equal(page.status,200);assert.match(page.body,/<title>Alice updated \| Portfolio<\/title>/);assert.match(page.body,/rel="canonical"/);assert.doesNotMatch(page.body,/unit-test-key/);
      assert.equal((await request('/.env')).status,404);assert.equal((await request('/cloud-server.js')).status,404);assert.equal((await request('/healthz')).body.payments,false);
    });
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('cloud configuration fails closed and keeps service key in backend request headers',async()=>{
  assert.throws(()=>createStore('', ''),/Configure/);
  let outbound;const store=createStore('https://example.supabase.co','test-secret',async(url,options)=>{outbound={url,options};return new Response('[]',{status:200});});
  await store.rest('forma_users','select=id');assert.equal(outbound.options.headers.apikey,'test-secret');assert.equal(outbound.options.headers.Authorization,'Bearer test-secret');assert.doesNotMatch(outbound.url,/test-secret/);
});
