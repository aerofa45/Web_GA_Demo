'use strict';
const el=id=>document.getElementById(id);
let active=null,outline={chapters:[]},published=false,generating=false,loading=0,directPdf=null;
const editorPanel=el('editor'),videoPanel=el('drive-video-panel');if(editorPanel&&videoPanel)editorPanel.after(videoPanel);
const say=msg=>{el('message').textContent=msg;el('generate-status').textContent=msg;};
async function api(url,opts={}){const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...opts});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Request failed ('+r.status+')');return data;}
function element(tag,value,callback){const x=document.createElement(tag);if(value!==undefined)x.textContent=value;if(callback){x.type='button';x.addEventListener('click',callback);}return x;}
async function list(){const [d,trash]=await Promise.all([api('/api/course-drafts'),api('/api/course-drafts?archived=true')]);el('courses').replaceChildren();for(const c of d.courses)el('courses').append(element('button',c.title+(c.published?' · Published':' · Draft'),()=>load(c.id).catch(e=>say(e.message))));el('trash').replaceChildren();for(const c of trash.courses){const row=element('p',c.title+' ');row.append(element('button','Restore '+c.title,async()=>{try{await api('/api/course-drafts/'+c.id+'/restore',{method:'POST',body:'{}'});await list();say('Course restored as a private draft.');}catch(e){say(e.message);}}));el('trash').append(row);}}
async function enrollments(){
 const root=el('enrollment-list');root.replaceChildren();
 if(!active){root.textContent='Select a course first.';return;}
 try{
  const courseId=active,d=await api('/api/course-enrollments/'+courseId);
  if(active!==courseId)return;
  if(!d.enrollments.length){root.textContent='No enrollment requests yet.';return;}
  for(const student of d.enrollments){
   const row=element('p',student.email+' — '+student.status+' ');
   for(const decision of ['approve','revoke']){
    
    if(decision==='revoke'&&student.status==='revoked')continue;
    row.append(element('button',decision==='approve'?(student.status==='approved'?'Sync Drive access':'Approve'):'Revoke',async()=>{
     try{
      if(!window.confirm((decision==='approve'?'Grant':'Revoke')+' Drive access for '+student.email+'?'))return;
      await api('/api/course-enrollments/'+courseId+'/decision',{method:'POST',body:JSON.stringify({email:student.email,decision})});
      if(active===courseId){say('Enrollment '+decision+' succeeded for '+student.email+'.');await enrollments();}
     }catch(error){say(error.message);}
    }));
   }
   root.append(row);
  }
 }catch(error){root.textContent=error.message;}
}
el('enrollment-refresh').addEventListener('click',enrollments);
async function load(id){const version=++loading,d=await api('/api/course-drafts/'+id);if(version!==loading)return;active=id;outline=d.course.outline||{chapters:[]};published=d.course.published;directPdf=null;el('material').value='';el('course-title').value=d.course.title;el('editor').hidden=false;publication();render();enrollments();window.dispatchEvent(new CustomEvent('forma:course-selected',{detail:{id}}));say('Editing '+d.course.title);}
function publication(){el('publication').textContent=published?'Published publicly':'Private draft';el('publish').textContent=published?'Unpublish course':'Publish publicly';el('preview').href='/course/'+active;}
function sources(){const select=el('material'),old=select.value;select.replaceChildren();const notes=element('option','Typed notes only');notes.value='';select.append(notes);const uploadOption=element('option','Upload a new PDF for Gemini');uploadOption.value='upload';select.append(uploadOption);if(directPdf){const directOption=element('option','Uploaded PDF: '+directPdf.name);directOption.value='direct';select.append(directOption);}outline.chapters.forEach((c,i)=>c.lessons.forEach((l,j)=>{const o=element('option',c.title+' / '+l.title+(l.pdfId?' (PDF)':' (text)'));o.value=i+':'+j;select.append(o);}));select.value=old;if(select.selectedIndex<0)select.value='';}
function input(tag,value,placeholder,change){const x=element(tag);x.value=value||'';x.placeholder=placeholder;x.setAttribute('aria-label',placeholder);x.addEventListener('input',()=>change(x.value));return x;}
function render(){sources();
 const selector=el('drive-lesson'),previous=selector.value;selector.replaceChildren();
 const placeholder=element('option','Select a text lesson');placeholder.value='';selector.append(placeholder);
 outline.chapters.forEach((chapter,i)=>chapter.lessons.forEach((lesson,j)=>{
  if(lesson.type!=='text')return;
  const option=element('option',chapter.title+' / '+lesson.title);option.value=i+':'+j;selector.append(option);
 }));
 selector.value=previous;if(selector.selectedIndex<0)selector.value='';
 const root=el('chapters');root.replaceChildren();outline.chapters.forEach((c,i)=>{
 const section=element('section');section.append(input('input',c.title,'Chapter title',v=>c.title=v));
 c.lessons.forEach((l,j)=>{
  const wrap=element('div');wrap.className='lesson';
  const name=input('input',l.title,'Lesson title',v=>l.title=v),type=element('select');type.setAttribute('aria-label','Lesson type');
  for(const t of ['text','youtube','quiz']){const o=element('option',t);o.value=t;type.append(o);}type.value=l.type;
  type.addEventListener('change',()=>{l.type=type.value;render();});
  const body=input('textarea',l.content,'Lesson text, YouTube watch URL, or quiz questions and answers',v=>l.content=v);body.rows=5;
  const upload=element('input');upload.type='file';upload.accept='application/pdf,.pdf';upload.setAttribute('aria-label','Attach PDF to this lesson');
  upload.addEventListener('change',async()=>{const courseId=active;try{const file=upload.files[0];if(!file)return;if(file.size>1800000)throw Error('PDF must be under 1.8 MB.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read PDF'));reader.readAsDataURL(file);});const d=await api('/api/course-pdf',{method:'POST',body:JSON.stringify({courseId,name:file.name,data})});if(active!==courseId||!outline.chapters.some(ch=>ch.lessons.includes(l)))throw Error('Course changed during upload. Reload the original course before attaching more files.');l.pdfId=d.file.id;l.pdfName=d.file.name;render();say('PDF uploaded. Save course to keep the lesson attachment.');}catch(e){say(e.message);}});
  wrap.append(name,type,body,element('p',l.pdfId?'Attached PDF: '+(l.pdfName||'PDF'):'Optional PDF attachment'),upload);
  if(l.pdfId){const open=element('a','View PDF');open.href='/api/course-pdf/'+l.pdfId;open.target='_blank';open.rel='noopener';wrap.append(open);}
  if(l.driveFile){
    const note=element('p','Google Drive video: '+l.driveFile.name+' (private instructor attachment; no student access yet)');
    wrap.append(note,element('button','Preview Drive video',()=>{const fileId=String(l.driveFile?.id||'');if(!/^[A-Za-z0-9_-]{10,}$/.test(fileId)){say('Drive video ID is invalid. Reattach the video.');return;}window.open('https://drive.google.com/file/d/'+encodeURIComponent(fileId)+'/preview','_blank','noopener,noreferrer');say('Opened Google Drive preview. If it cannot play, verify Drive permissions, video processing, and your Google account.');}),element('button','Remove Drive video',()=>{delete l.driveFile;render();say('Drive video removed from lesson. Click Save course to persist.');}));
  }
  if(l.type==='youtube')wrap.append(element('button','Preview video',()=>{const id=CourseTools.youtubeId(l.content);if(!id){say('Enter a valid HTTPS YouTube watch, short, embed or youtu.be URL.');return;}wrap.querySelector('iframe')?.remove();const frame=element('iframe');frame.src='https://www.youtube-nocookie.com/embed/'+id;frame.title=l.title||'YouTube lesson';frame.allow='fullscreen; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';frame.style.cssText='width:100%;aspect-ratio:16/9;border:0';wrap.append(frame);}));
  else wrap.append(element('button','Regenerate lesson',()=>generate({scope:'lesson',chapter:i,lesson:j})));
  wrap.append(element('button','Remove lesson',()=>{c.lessons.splice(j,1);render();}));section.append(wrap);
 });
 section.append(element('button','Add lesson',()=>{c.lessons.push({title:'New lesson',type:'text',content:''});render();}),element('button','Regenerate chapter',()=>generate({scope:'chapter',chapter:i})),element('button','Remove chapter',()=>{outline.chapters.splice(i,1);render();}));root.append(section);
});}
async function save(nextPublished=published){if(!active)throw Error('Select a course first.');const courseId=active;await api('/api/course-drafts/'+courseId,{method:'PUT',body:JSON.stringify({title:el('course-title').value,outline,published:nextPublished})});if(active===courseId){published=nextPublished;publication();}await list();say('Course saved'+(nextPublished?' and published.':'.'));}
async function generate(target={scope:'course'}){
 if(generating)return;try{if(!active)throw Error('Select a course first.');const courseId=active,snapshot=JSON.stringify(outline),selection=el('material').value;
 if(selection==='upload')throw Error('Choose a PDF first.');const [i,j]=selection.split(':').map(Number),selected=selection&&selection!=='direct'?outline.chapters[i]?.lessons[j]:null;
 const chapter=outline.chapters[target.chapter],lesson=chapter?.lessons[target.lesson];
 const targetChapter=target.scope==='lesson'?{title:chapter.title,lessons:[lesson]}:target.scope==='chapter'?{title:chapter.title,lessons:chapter.lessons.filter(l=>l.type!=='youtube')}:undefined;
 if(targetChapter&&!targetChapter.lessons.length)throw Error('Add a text or quiz lesson before regenerating.');
 const material=selection==='direct'?directPdf:selected||(target.scope==='lesson'?lesson:null);
 const context=material?.content||(targetChapter?targetChapter.lessons.map(l=>l.content).join('\n'):'');
 generating=true;el('generate').disabled=true;say('Generating '+target.scope+'...');
 const d=await api('/api/course-generate',{method:'POST',body:JSON.stringify({source:[el('source').value,context].filter(Boolean).join('\n'),topic:el('topic').value,pdfId:material?.pdfId,courseId,scope:target.scope,target:targetChapter})});
 if(active!==courseId||JSON.stringify(outline)!==snapshot)throw Error('Course changed during generation. No generated content was applied. Try again.');
 outline=CourseTools.applyGeneration(outline,d.outline,target);render();say(target.scope==='course'?'Generated chapters added. Review, then Save course.':'Selected '+target.scope+' regenerated. Other lessons and attachments were preserved. Review, then Save course.');
 }catch(e){say(e.message);}finally{generating=false;el('generate').disabled=false;}
}
el('material').addEventListener('change',()=>{if(el('material').value==='upload')el('gemini-pdf-file').click();});
el('gemini-pdf-file').addEventListener('change',async()=>{const inputFile=el('gemini-pdf-file').files?.[0];if(!inputFile)return;const courseId=active;try{if(!courseId)throw Error('Create or select a course first.');if(inputFile.size>1800000)throw Error('PDF must be less than 1.8 MB.');el('gemini-pdf-status').textContent='Uploading PDF...';const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read PDF.'));reader.readAsDataURL(inputFile);});const result=await api('/api/course-pdf',{method:'POST',body:JSON.stringify({courseId,name:inputFile.name,data})});if(active!==courseId)throw Error('Course changed during upload. Select the original course to use the PDF.');directPdf={pdfId:result.file.id,name:result.file.name};sources();el('material').value='direct';el('gemini-pdf-status').textContent='Ready: '+directPdf.name+'. Click Generate outline; no typed notes required.';say('PDF uploaded for Gemini.');}catch(e){el('gemini-pdf-status').textContent=e.message;say(e.message);sources();}finally{el('gemini-pdf-file').value='';}});
let pendingDriveFile=null;
function attachDriveFile(){
 try{
  if(!active)throw Error('Select or create a course first.');
  if(!pendingDriveFile)throw Error('Choose a video using Select Drive video first.');
  const selected=el('drive-lesson').value;
  if(!/^\d+:\d+$/.test(selected))throw Error('Choose a text lesson from the dropdown before attaching.');
  const [i,j]=selected.split(':').map(Number),lesson=outline.chapters[i]?.lessons[j];
  if(!lesson||lesson.type!=='text')throw Error('Choose a text lesson.');
  lesson.driveFile={id:pendingDriveFile.id,name:pendingDriveFile.name,mimeType:pendingDriveFile.mimeType};
  render();el('drive-lesson').value=selected;
  el('drive-file').textContent='Attached '+pendingDriveFile.name+' to '+lesson.title+'. Click Save course above, then reopen this course to verify it was saved.';
  say('Attached video to '+lesson.title+'. Click Save course to persist.');
 }catch(error){el('drive-file').textContent=error.message;say(error.message);}
}
el('drive-attach').addEventListener('click',attachDriveFile);
window.addEventListener('forma:drive-video-selected',event=>{
 pendingDriveFile=event.detail;
 if(!pendingDriveFile?.id||!pendingDriveFile?.name){el('drive-file').textContent='Invalid selected video.';return;}
 if(/^\d+:\d+$/.test(el('drive-lesson').value))attachDriveFile();
 else el('drive-file').textContent='Selected '+pendingDriveFile.name+'. Now choose a text lesson above, then click Attach selected video to lesson.';
});
el('create').addEventListener('click',async()=>{try{const d=await api('/api/course-drafts',{method:'POST',body:JSON.stringify({title:el('new-title').value})});await list();await load(d.course.id);}catch(e){say(e.message);}});
el('add-chapter').addEventListener('click',()=>{outline.chapters.push({title:'New chapter',lessons:[]});render();});
el('save').addEventListener('click',()=>save().catch(e=>say(e.message)));
el('publish').addEventListener('click',()=>{if(!published&&!window.confirm('Publish this course publicly? Lesson text, quizzes and YouTube links will be visible to anyone with the course link. PDFs remain private.'))return;save(!published).catch(e=>say(e.message));});
el('delete-course').addEventListener('click',async()=>{if(!active||!window.confirm('Move this course to Trash? It will be unpublished. You can restore it from Trash.'))return;const courseId=active;try{await api('/api/course-drafts/'+courseId,{method:'DELETE',body:'{}'});if(active===courseId){active=null;outline={chapters:[]};el('editor').hidden=true;sources();}await list();say('Course moved to Trash. You can restore it below Your courses.');}catch(e){say(e.message);}});
el('generate').addEventListener('click',()=>generate());
window.addEventListener('error',e=>say('Page error: '+e.message));window.addEventListener('unhandledrejection',e=>say(e.reason?.message||'Request failed.'));
api('/api/me').then(d=>{if(!d.user)location.href='/login';else list().then(async()=>{if(!active){const first=el('courses').querySelector('button');if(first)first.click();}}).catch(e=>say(e.message));}).catch(e=>say(e.message));
