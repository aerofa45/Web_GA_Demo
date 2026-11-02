'use strict';
const http = require('node:http');
const {validateOutline}=require('./course');
const {applyGeneration}=require('./public/course-tools');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const sharp = require('sharp');
const {initial,sanitize,clean} = require('./profile');
const scrypt = promisify(crypto.scrypt);
const ROOT = path.join(__dirname,'public');
const TTL = 7*86400000;
const tokenHash = s => crypto.createHash('sha256').update(s).digest('hex');
const id = () => crypto.randomBytes(24).toString('hex');
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }

function createStore(url,key,fetcher=fetch){
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||'')||!key) throw Error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. No local fallback is used.');
  async function request(route,{method='GET',body,headers={}}={}){
    const r=await fetcher(url+route,{method,headers:{apikey:key,Authorization:'Bearer '+key,...headers},body,signal:AbortSignal.timeout(20000)});
    if(!r.ok){const err=await r.json().catch(()=>({})); if(err.code==='23505')throw new HttpError(409,'Email or public URL is already registered.'); throw new HttpError(503,'Storage is temporarily unavailable. Please try again.');}
    if(r.status===204)return null;
    const text=await r.text(); return text?JSON.parse(text):null;
  }
  const rest=(table,query='',method='GET',body)=>request('/rest/v1/'+table+(query?'?'+query:''),{method,body:body===undefined?undefined:JSON.stringify(body),headers:{'Content-Type':'application/json',Prefer:'return=minimal'}});
  return {url,key,rest,rpc:(name,args)=>rest('rpc/'+name,'','POST',args),
    upload:(name,bytes)=>request('/storage/v1/object/forma-images/'+name,{method:'POST',body:bytes,headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000'}}),
    removeImages:prefixes=>request('/storage/v1/object/forma-images',{method:'DELETE',body:JSON.stringify({prefixes}),headers:{'Content-Type':'application/json'}})};
}

function createApp(store,{origin='',production=false,trustProxy=false,fetcher=fetch,geminiKey=process.env.GEMINI_API_KEY,geminiModel=process.env.GEMINI_MODEL||'gemini-2.5-flash'}={}){
  const sessionName=production?'__Host-forma_session':'forma_session';
  const cookie=(token,age=TTL/1000)=>`${sessionName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${production?'; Secure':''}`;
  const json=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value));};
  const eq=value=>'eq.'+encodeURIComponent(value);
  async function read(req){
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>2600000)throw new HttpError(413,'Request too large. Images must be under 1.8 MB.');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new HttpError(400,'Invalid JSON.');}
  }
  async function current(req){
    const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(sessionName+'='))?.slice(sessionName.length+1);
    if(!raw||!/^[a-f0-9]{48}$/.test(raw))return null;
    const rows=await store.rest('forma_sessions',`tokenhash=${eq(tokenHash(raw))}&expires=gt.${Date.now()}&select=user_id&limit=1`);
    if(!rows.length)return null;
    const users=await store.rest('forma_users',`id=${eq(rows[0].user_id)}&select=id,name,email,slug&limit=1`);
    return users[0]||null;
  }
  async function auth(req){const user=await current(req);if(!user)throw new HttpError(401,'Please log in.');return user;}
  async function profile(user){const rows=await store.rest('forma_profiles',`user_id=${eq(user)}&select=data&limit=1`);if(!rows.length)throw new HttpError(404,'Portfolio not found.');return rows[0].data;}
  async function rate(req,action,max,window=3600000){
    const ip=trustProxy?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress;
    const key=crypto.createHmac('sha256',store.key).update(action+':'+ip).digest('hex');
    if(!await store.rpc('forma_limit',{p_key:key,p_now:Date.now(),p_window:window,p_max:max}))throw new HttpError(429,action.startsWith('gemini:')?'Forma Studio generation test limit reached for this network. Try again after the hourly window.':'Too many requests. Please try again later.');
  }
  async function userBySlug(slug){const users=await store.rest('forma_users',`slug=${eq(slug)}&select=id,name,slug&limit=1`);if(!users.length)throw new HttpError(404,'Portfolio not found.');return users[0];}
  const demo=sanitize({...initial('Jordan Ellis','demo'),headline:'Design engineer · Creative technologist',location:'Fictional example',bio:'This read-only example shows how a portfolio can present research, projects, and experience. Create an account to build your own.',featuredText:'Thoughtful ideas. Useful digital experiences.',heroImage:'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1800&q=80'},{name:'Jordan Ellis'});

  return async function handler(req,res){
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; media-src 'self' https:; frame-src https://www.youtube-nocookie.com; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
    if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
    try{
      const url=new URL(req.url,'http://localhost');const p=url.pathname;const method=req.method;
      if(!['GET','HEAD','POST','PUT','DELETE'].includes(method))throw new HttpError(405,'Method not allowed.');
      if(p==='/healthz'){await store.rest('forma_users','select=id&limit=0');return json(res,200,{status:'ok',mode:'portfolio-beta',payments:false});}
      if(p.startsWith('/api/')){
        if(!['GET','HEAD'].includes(method)){
          const expected=origin||(production?process.env.RENDER_EXTERNAL_URL:'');
          if(req.headers.origin&&req.headers.origin!==expected)throw new HttpError(403,'Invalid request origin.');
          if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'Cross-site requests are blocked.');
          if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Send JSON.');
        }
        if(p==='/api/me'&&method==='GET'){const user=await current(req);return json(res,200,user?{user,profile:await profile(user.id)}:{user:null});}
        if(p==='/api/register'&&method==='POST'){
          await rate(req,'register',8);const b=await read(req);const email=clean(b.email,254).toLowerCase(),name=clean(b.name,70),slug=clean(b.slug,45).toLowerCase(),password=String(b.password||'');
          if(!/^\S+@\S+\.\S+$/.test(email)||!name||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||password.length<10||password.length>256)throw new HttpError(400,'Use a valid email, name, URL name, and password of 10–256 characters.');
          if(['demo','app','login','register','admin','api','public','assets','privacy'].includes(slug))throw new HttpError(400,'That URL name is reserved.');
          const uid=id(),salt=id(),token=id(),passhash=(await scrypt(password,salt,64)).toString('hex');const data=sanitize(initial(name,slug),{name});
          await store.rpc('forma_register',{p_user:{id:uid,email,name,slug,salt,passhash,created:Date.now()},p_profile:data,p_token:tokenHash(token),p_expires:Date.now()+TTL});
          return json(res,201,{user:{id:uid,email,name,slug},profile:data},{'Set-Cookie':cookie(token)});
        }
        if(p==='/api/login'&&method==='POST'){
          await rate(req,'login',20,900000);const b=await read(req);const password=String(b.password||'');if(password.length>256)throw new HttpError(400,'Invalid password length.');
          const rows=await store.rest('forma_users',`email=${eq(clean(b.email,254).toLowerCase())}&select=*&limit=1`);const user=rows[0];
          const provided=await scrypt(password,user?.salt||'invalid-user-salt',64);const expected=user?Buffer.from(user.passhash,'hex'):Buffer.alloc(64);
          if(!crypto.timingSafeEqual(provided,expected)||!user)throw new HttpError(401,'Invalid email or password.');
          const token=id();await store.rest('forma_sessions','','POST',{tokenhash:tokenHash(token),user_id:user.id,expires:Date.now()+TTL});
          const {id:uid,name,email,slug}=user;return json(res,200,{user:{id:uid,name,email,slug},profile:await profile(uid)},{'Set-Cookie':cookie(token)});
        }
        if(p==='/api/logout'&&method==='POST'){
          const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(sessionName+'='))?.slice(sessionName.length+1);
          if(raw)await store.rest('forma_sessions',`tokenhash=${eq(tokenHash(raw))}`,'DELETE');return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
        }
        if(p==='/api/profile'&&method==='PUT'){
          const user=await auth(req);await rate(req,'save:'+user.id,100);const b=await read(req);const data=sanitize(b,user);
          if(JSON.stringify(data).length>250000)throw new HttpError(413,'Portfolio text is too large. Please shorten it.');
          await store.rest('forma_profiles',`user_id=${eq(user.id)}`,'PATCH',{data,updated:Date.now()});return json(res,200,{ok:true,profile:data,url:'/u/'+user.slug});
        }
        if(p==='/api/images'&&method==='POST'){
          const user=await auth(req);await rate(req,'images:'+user.id,30);const b=await read(req);
          const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(b.data||''));if(!match)throw new HttpError(400,'Choose a JPG, PNG, or WebP image.');
          const input=Buffer.from(match[2],'base64');if(input.length>1800000)throw new HttpError(413,'Maximum image size is 1.8 MB.');
          let bytes;try{bytes=await sharp(input,{limitInputPixels:25000000,animated:false}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer();}catch{throw new HttpError(400,'The image could not be decoded.');}
          if(bytes.length>1048576)throw new HttpError(413,'Please use a smaller image.');
          const name=user.id+'/'+id()+'.webp';
          if(!await store.rpc('forma_reserve_upload',{p_user:user.id,p_id:name,p_now:Date.now()}))throw new HttpError(409,'This beta allows 30 images per account.');
          try{await store.upload(name,bytes);}catch(e){await store.rest('forma_uploads',`id=${eq(name)}`,'DELETE');throw e;}
          return json(res,201,{url:store.url+'/storage/v1/object/public/forma-images/'+name});
        }
        if(p==='/api/messages'&&method==='GET'){const user=await auth(req);return json(res,200,{messages:await store.rest('forma_messages',`user_id=${eq(user.id)}&select=id,sender,email,message,created&order=created.desc&limit=100`)});}
        let m=p.match(/^\/api\/public\/([a-z0-9-]+)$/);
        if(m&&method==='GET'){if(m[1]==='demo')return json(res,200,{slug:'demo',profile:demo});const user=await userBySlug(m[1]);return json(res,200,{slug:user.slug,profile:await profile(user.id)});}
        m=p.match(/^\/api\/contact\/([a-z0-9-]+)$/);
        if(m&&method==='POST'){
          await rate(req,'contact',10);if(m[1]==='demo')throw new HttpError(400,'The example portfolio does not accept messages.');
          const user=await userBySlug(m[1]);const b=await read(req),sender=clean(b.sender,90),email=clean(b.email,254),message=clean(b.message,3000);
          if(!sender||!/^\S+@\S+\.\S+$/.test(email)||message.length<5)throw new HttpError(400,'Enter your name, email, and a message of at least 5 characters.');
          await store.rest('forma_messages','','POST',{id:id(),user_id:user.id,sender,email,message,created:Date.now()});return json(res,201,{ok:true});
        }

        // Private PDF attachments: each file belongs to a course and an authenticated instructor.
        if(p==='/api/course-pdf'&&method==='POST'){
          const user=await auth(req);await rate(req,'pdf:'+user.id,20);
          const b=await read(req),courseId=String(b.courseId||''),raw=String(b.data||'');
          if(!/^[a-f0-9]{48}$/.test(courseId))throw new HttpError(400,'Select a course first.');
          const owned=await store.rest('forma_course_drafts',`id=${eq(courseId)}&user_id=${eq(user.id)}&select=id,published,outline&limit=1`);
          if(!owned.length)throw new HttpError(404,'Course not found.');
          if(!/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw))throw new HttpError(400,'Upload a PDF file.');
          const bytes=Buffer.from(raw.split(',')[1],'base64');
          if(bytes.length<8||bytes.length>1800000||bytes.subarray(0,5).toString()!=='%PDF-')throw new HttpError(400,'PDF must be valid and under 1.8 MB.');
          const fileId=id(),objectKey=user.id+'/'+courseId+'/'+fileId+'.pdf';
          const response=await fetcher(store.url+'/storage/v1/object/forma-course-pdfs/'+objectKey,{method:'POST',headers:{apikey:store.key,Authorization:'Bearer '+store.key,'Content-Type':'application/pdf','x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(20000)});
          if(!response.ok)throw new HttpError(503,'PDF storage failed. Ensure the private forma-course-pdfs bucket exists.');
          await store.rest('forma_course_files','','POST',{id:fileId,course_id:courseId,user_id:user.id,object_key:objectKey,file_name:clean(b.name,160)||'Lecture.pdf',size_bytes:bytes.length,created:Date.now()});
          return json(res,201,{file:{id:fileId,name:clean(b.name,160)||'Lecture.pdf',size:bytes.length}});
        }
        let pdfMatch=p.match(/^\/api\/course-pdf\/([a-f0-9]{48})$/);
        if(pdfMatch&&method==='GET'){
          const user=await auth(req),rows=await store.rest('forma_course_files',`id=${eq(pdfMatch[1])}&user_id=${eq(user.id)}&select=object_key,file_name&limit=1`);
          if(!rows.length)throw new HttpError(404,'File not found.');
          const r=await fetcher(store.url+'/storage/v1/object/forma-course-pdfs/'+rows[0].object_key,{headers:{apikey:store.key,Authorization:'Bearer '+store.key},signal:AbortSignal.timeout(20000)});
          if(!r.ok)throw new HttpError(503,'PDF unavailable.');
          const bytes=Buffer.from(await r.arrayBuffer());res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="lesson.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(bytes);
        }
        // Staging course studio: owner-only drafts; no payment or private Drive playback.
        if(p==='/api/course-drafts'&&method==='GET'){
          const user=await auth(req);
          const rows=await store.rest('forma_course_drafts',`user_id=${eq(user.id)}&select=id,title,outline,published,created,updated&order=updated.desc&limit=100`);
          return json(res,200,{courses:rows.filter(c=>Boolean(c.outline?.archived)===(url.searchParams.get('archived')==='true'))});
        }
        if(p==='/api/course-drafts'&&method==='POST'){
          const user=await auth(req);await rate(req,'courses:'+user.id,30);const b=await read(req);
          const title=clean(b.title,140);if(!title)throw new HttpError(400,'Course title is required.');
          const course={id:id(),user_id:user.id,title,document_text:'',outline:{chapters:[]},created:Date.now(),updated:Date.now(),published:false};
          await store.rest('forma_course_drafts','','POST',course);return json(res,201,{course});
        }
        let courseMatch=p.match(/^\/api\/course-drafts\/([a-f0-9]{48})$/);
        if(courseMatch&&method==='GET'){
          const user=await auth(req);
          const rows=await store.rest('forma_course_drafts',`id=${eq(courseMatch[1])}&user_id=${eq(user.id)}&select=*&limit=1`);
          if(!rows.length||rows[0].outline?.archived)throw new HttpError(404,'Course not found.');return json(res,200,{course:rows[0]});
        }
        if(courseMatch&&method==='PUT'){
          const user=await auth(req);await rate(req,'course-edit:'+user.id,120);
          const rows=await store.rest('forma_course_drafts',`id=${eq(courseMatch[1])}&user_id=${eq(user.id)}&select=id,published,outline&limit=1`);
          if(!rows.length)throw new HttpError(404,'Course not found.');
          if(rows[0].outline?.archived)throw new HttpError(409,'Restore this course from Trash before editing.');
          const b=await read(req),title=clean(b.title,140),outline=b.outline;
          if(outline?.archived!==undefined)throw new HttpError(400,'Use the course Trash controls.');
          if(!title)throw new HttpError(400,'Course title is required.');
          try{validateOutline(outline);}catch{throw new HttpError(400,'Invalid course outline.');}
          if(b.published!==undefined&&typeof b.published!=='boolean')throw new HttpError(400,'Invalid publication status.');
          if((b.published??rows[0].published)&&(!outline.chapters.length||outline.chapters.some(c=>!c.lessons.length||c.lessons.some(l=>!l.content.trim()))))throw new HttpError(400,'Add content to every chapter and lesson before publishing.');
          for(const pdfId of new Set(outline.chapters.flatMap(ch=>ch.lessons.map(l=>l.pdfId).filter(Boolean)))){
            const files=await store.rest('forma_course_files','id='+eq(pdfId)+'&user_id='+eq(user.id)+'&course_id='+eq(courseMatch[1])+'&select=id&limit=1');
            if(!files.length)throw new HttpError(400,'An attached PDF does not belong to this course.');
          }
          await store.rest('forma_course_drafts',`id=${eq(courseMatch[1])}&user_id=${eq(user.id)}`,'PATCH',{title,outline,...(b.published===undefined?{}:{published:b.published}),updated:Date.now()});
          return json(res,200,{ok:true});
        }
        const restoreMatch=p.match(/^\/api\/course-drafts\/([a-f0-9]{48})\/restore$/);
        if((courseMatch&&method==='DELETE')||(restoreMatch&&method==='POST')){
          const user=await auth(req),courseId=courseMatch?.[1]||restoreMatch[1];await rate(req,'course-edit:'+user.id,120);
          const rows=await store.rest('forma_course_drafts','id='+eq(courseId)+'&user_id='+eq(user.id)+'&select=id,outline&limit=1');
          if(!rows.length)throw new HttpError(404,'Course not found.');
          const outline={...rows[0].outline};if(method==='DELETE')outline.archived=true;else delete outline.archived;
          await store.rest('forma_course_drafts','id='+eq(courseId)+'&user_id='+eq(user.id),'PATCH',{outline,published:false,updated:Date.now()});
          return json(res,200,{ok:true});
        }
        const viewMatch=p.match(/^\/api\/course-view\/([a-f0-9]{48})$/);
        if(viewMatch&&method==='GET'){
          const viewer=await current(req);
          const rows=await store.rest('forma_course_drafts','id='+eq(viewMatch[1])+'&select=id,user_id,title,outline,published&limit=1');
          const course=rows[0];
          if(!course||course.outline?.archived||(!course.published&&course.user_id!==viewer?.id))throw new HttpError(404,'Course not found.');
          const owner=course.user_id===viewer?.id;
          const outline={chapters:course.outline.chapters.map(c=>({title:c.title,lessons:c.lessons.map(l=>({title:l.title,type:l.type,content:l.content,...(owner&&l.pdfId?{pdfId:l.pdfId,pdfName:l.pdfName}:{})}))}))};
          return json(res,200,{course:{id:course.id,title:course.title,published:course.published,outline},owner});
        }
        if(p==='/api/course-generate'&&method==='POST'){
          const user=await auth(req);
          const b=await read(req);const source=clean(b.source,16000),topic=clean(b.topic,180);
          const scope=b.scope||'course';
          if(!['course','chapter','lesson'].includes(scope))throw new HttpError(400,'Invalid generation scope.');
          if(scope!=='course'){
            try{validateOutline({chapters:[b.target]});}catch{throw new HttpError(400,'Invalid generation target.');}
            if(!b.target.lessons.length||b.target.lessons.some(l=>l.type==='youtube')||(scope==='lesson'&&b.target.lessons.length!==1))throw new HttpError(400,'Choose text or quiz lessons to regenerate.');
          }
          if(source.length<80&&!b.pdfId)throw new HttpError(400,'Paste at least 80 characters of notes or choose an attached PDF.');
          if(!/^gemini-[a-z0-9.-]+$/.test(geminiModel))throw new HttpError(503,'Gemini model configuration is invalid.');
          const apiKey=geminiKey;if(!apiKey)throw new HttpError(503,'Gemini is not configured.');
          let pdfPart=null;
          if(b.pdfId){
            if(!/^[a-f0-9]{48}$/.test(String(b.pdfId))||!/^[a-f0-9]{48}$/.test(String(b.courseId)))throw new HttpError(400,'Select a valid course PDF.');
            const files=await store.rest('forma_course_files',`id=${eq(String(b.pdfId))}&user_id=${eq(user.id)}&select=object_key,course_id&limit=1`);
            if(!files.length||files[0].course_id!==String(b.courseId||''))throw new HttpError(404,'Course PDF not found.');
            const download=await fetcher(store.url+'/storage/v1/object/forma-course-pdfs/'+files[0].object_key,{headers:{apikey:store.key,Authorization:'Bearer '+store.key},signal:AbortSignal.timeout(20000)});
            if(!download.ok)throw new HttpError(503,'Could not retrieve PDF.');
            const data=Buffer.from(await download.arrayBuffer());
            if(data.length<8||data.subarray(0,5).toString()!=='%PDF-')throw new HttpError(400,'Stored file is not a valid PDF.');
            if(data.length>1800000)throw new HttpError(413,'PDF too large.');
            pdfPart={inline_data:{mime_type:'application/pdf',data:data.toString('base64')}};
          }
          await rate(req,'gemini:'+user.id,20,3600000);
          const instruction=scope==='course'?'Create 2-5 concise chapters.':'Return exactly one chapter with exactly '+b.target.lessons.length+' lessons, keeping each lesson type in this order: '+b.target.lessons.map(l=>l.type).join(', ')+'. Regenerate this target: '+JSON.stringify(b.target)+'.';
          const prompt=instruction+' '+'You are creating an editable educational course. Return ONLY JSON of shape {"chapters":[{"title":"...","lessons":[{"title":"...","type":"text","content":"..."},{"title":"...","type":"quiz","content":"Questions with answers"}]}]}. Ground every explanation only in supplied material. Never include markdown fences. Topic: '+topic+'\\nNotes: '+source;
          let response;
          try{response=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/'+geminiModel+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{parts:[{text:prompt},...(pdfPart?[pdfPart]:[])]}],generationConfig:{responseMimeType:'application/json'}}),signal:AbortSignal.timeout(45000)});
          }catch(e){const timeout=['TimeoutError','AbortError'].includes(e.name);throw new HttpError(timeout?504:502,timeout?'Gemini timed out. Please try again.':'Could not reach Gemini. Please try again.');}
          if(!response.ok){
            const errorBody=await response.json().catch(()=>({}));
            const providerCode=String(errorBody.error?.status||'');
            console.error('Gemini upstream status:',response.status,providerCode);
            if(response.status===429)throw new HttpError(429,'Gemini rate limit or quota reached. Check Google AI Studio usage and billing.');
            if(response.status===400)throw new HttpError(502,'Gemini rejected the request. The PDF or model input may be unsupported.');
            if(response.status===401||response.status===403)throw new HttpError(502,'Gemini API key is invalid, restricted, or lacks permission.');
            if(response.status===404)throw new HttpError(502,'The configured Gemini model is unavailable. Check GEMINI_MODEL against models available to this API key.');
            throw new HttpError(502,'Gemini temporarily failed (HTTP '+response.status+').');
          }
          const data=await response.json().catch(()=>{throw new HttpError(502,'Gemini returned an invalid response.');});
          if(data.promptFeedback?.blockReason||data.candidates?.[0]?.finishReason!=='STOP')throw new HttpError(502,'Gemini could not complete the outline. Try a smaller source or different material.');
          const raw=data.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||'';
          let outline;try{outline=JSON.parse(raw);}catch{throw new HttpError(502,'Gemini returned an invalid outline.');}
          try{validateOutline(outline,{generated:true});}catch{throw new HttpError(502,'Gemini returned an invalid outline.');}
          if(scope!=='course'){
            try{applyGeneration({chapters:[b.target]},outline,{scope:'chapter',chapter:0});}catch{throw new HttpError(502,'Gemini returned a replacement that does not match the selected lessons.');}
          }
          return json(res,200,{outline});
        }
        if(/^\/api\/(public-courses\/|courses|earnings|withdrawals|admin|payment-connectors|stripe|esewa|course-video|media)/.test(p))throw new HttpError(403,'Payments, private lessons, withdrawals, and video uploads are disabled in this portfolio beta.');
        throw new HttpError(404,'Not found.');
      }
      if(!['GET','HEAD'].includes(method))throw new HttpError(405,'Method not allowed.');
      if(p==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('User-agent: *\nDisallow: /app\nDisallow: /api/\nDisallow: /login\nDisallow: /register\n');}
      const routes=['/','/app','/login','/register','/privacy','/course-studio'];const isPage=routes.includes(p)||/^\/course\/[a-f0-9]{48}$/.test(p)||/^\/u\/[a-z0-9-]+$/.test(p);
      if(!isPage&&!['/app.js','/style.css','/course-studio.js','/course-tools.js','/course-view.js'].includes(p))throw new HttpError(404,'Not found.');
      let content=await fs.readFile(path.join(ROOT,isPage?(p==='/course-studio'?'course-studio.html':p.startsWith('/course/')?'course-view.html':'index.html'):p.slice(1)));const type=isPage?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8';
      if(isPage){let title='Forma Studio — Your portfolio, your space',description='Build and publish a personal portfolio with customizable pages and images.';if(p.startsWith('/u/')){const slug=p.slice(3),data=slug==='demo'?demo:await profile((await userBySlug(slug)).id);title=data.name+' | Portfolio';description=clean(data.bio,160);}let base=origin||(production?process.env.RENDER_EXTERNAL_URL:'');content=content.toString().replace('__TITLE__',escape(title)).replaceAll('__DESCRIPTION__',escape(description)).replace('__CANONICAL__',base?`<link rel="canonical" href="${escape(base+p)}">`:'');}
      res.writeHead(200,{'Content-Type':type,'Cache-Control':isPage?'no-cache':'public, max-age=300'});return res.end(method==='HEAD'?undefined:content);
    }catch(e){const status=e.status||500;if(status>=500)console.error('Forma request failed:',e.name);if(!res.headersSent)return json(res,status,{error:status===500?'Something went wrong. Please try again.':e.message});res.end();}
  };
}

if(require.main===module){
  const store=createStore(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const app=createApp(store,{origin:process.env.APP_ORIGIN||'',production:process.env.NODE_ENV==='production',trustProxy:!!process.env.RENDER});
  const server=http.createServer(app);server.requestTimeout=90000;server.headersTimeout=10000;
  server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Forma portfolio beta listening'));
  process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
module.exports={createApp,createStore};
