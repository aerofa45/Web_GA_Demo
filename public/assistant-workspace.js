'use strict';
(()=>{const $=id=>document.getElementById(id),domain=$('domain'),action=$('action'),course=$('course'),status=$('status');let pending=null;
const portfolios=['experience','education','research','projects','publications'];
const ops={portfolio:portfolios.flatMap(x=>[{value:x+':add',label:'Add '+x},{value:x+':replace',label:'Edit '+x},{value:x+':remove',label:'Remove '+x}]),course:[{value:'rename-course',label:'Rename course'},{value:'add-chapter',label:'Add chapter'},{value:'rename-chapter',label:'Rename chapter'},{value:'add-lesson',label:'Add lesson'},{value:'edit-lesson',label:'Edit lesson'},{value:'remove-lesson',label:'Remove lesson'}]};
function say(who,message){
 const container=$('conversation'),line=document.createElement('p');
 line.style.cssText='margin:0;padding:10px 12px;border-radius:10px;background:'+(who==='You'?'#243b5e':'#24312e')+';color:white';
 line.textContent=who+': '+String(message).slice(0,1500);container.append(line);container.scrollTop=container.scrollHeight;
}
function renderVisual(data,area){
 area.replaceChildren();
 const heading=(tag,value,parent=area)=>{const el=document.createElement(tag);el.textContent=String(value||'');parent.append(el);return el};
 if(data?.proposed?.outline){
  heading('h3',data.proposed.title);
  for(const chapter of data.proposed.outline.chapters||[]){
   const block=document.createElement('section');block.style.cssText='border-left:3px solid #4d6dba;padding:4px 12px;margin:12px 0';
   heading('h4',chapter.title,block);
   for(const lesson of chapter.lessons||[]){
    heading('strong',lesson.title,block);
    const p=heading('p',lesson.content||('Lesson type: '+lesson.type),block);
    p.style.whiteSpace='pre-wrap';
   }area.append(block);
  }
 }else if(data?.section&&Array.isArray(data.entries)){
  heading('h3',data.section[0].toUpperCase()+data.section.slice(1));
  if(!data.entries.length)heading('p','This section will be empty.');
  for(const entry of data.entries){
   const item=document.createElement('article');item.style.cssText='border-bottom:1px solid #d0d8e5;padding:8px 0';
   heading('h4',entry.title||'Untitled',item);heading('p',entry.subtitle||'',item);
   const description=heading('p',entry.description||'',item);description.style.whiteSpace='pre-wrap';area.append(item);
  }
 }else heading('p','Preview data is unavailable.');
}
async function connectorStatus(){
 const target=$('connector-status');
 try{const response=await fetch('/.well-known/oauth-protected-resource',{credentials:'same-origin'});
  const data=await response.json().catch(()=>({}));
  if(response.ok&&data.resource===location.origin+'/mcp'){
   target.textContent='Connector endpoint is available. In ChatGPT, add a custom MCP server at '+data.resource+' and approve permissions after signing in.';
  }else target.textContent='Connector is not enabled on this staging deployment. Forma Studio account editing works independently.';
 }catch{target.textContent='Connector availability could not be checked.'}
}
async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',...opt}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Request failed ('+r.status+')');return d}
function renderOps(){pending=null;$('apply').disabled=true;$('course-choice').hidden=domain.value!=='course';action.replaceChildren();for(const item of ops[domain.value]){const opt=document.createElement('option');opt.value=item.value;opt.textContent=item.label;action.append(opt)}}
async function init(){try{const me=await api('/api/me');if(!me.user){location.href='/login';return}const result=await api('/api/account/role');if(result.role==='instructor'){const courses=await api('/api/course-drafts');for(const c of courses.courses){const o=document.createElement('option');o.value=c.id;o.textContent=c.title;course.append(o)}}else status.textContent='Student mode: portfolio edits are available. Course edits require instructor mode.';await history()}catch(e){status.textContent=e.message}}
function build(){const values=action.value.split(':'),position=Number($('position').value)-1,chapter=Number($('chapter').value)-1,title=$('title').value.trim(),content=$('content').value.trim();if(domain.value==='portfolio'){const section=values[0],operation=values[1],data={section,operation};if(operation!=='add')data.index=position;if(operation!=='remove')data.entry={title,subtitle:'',description:content};return {url:'/api/portfolio-edit',data}}const operation=values[0],data={courseId:course.value,operation};if(!data.courseId)throw Error('Select a course first.');if(['rename-course','add-chapter','rename-chapter','add-lesson','edit-lesson'].includes(operation))data.title=title;if(['add-lesson','edit-lesson'].includes(operation))data.content=content;if(['rename-chapter','add-lesson','edit-lesson','remove-lesson'].includes(operation))data.chapterIndex=chapter;if(['edit-lesson','remove-lesson'].includes(operation))data.lessonIndex=position;return {url:'/api/course-edit',data}}
$('upload-resource').onclick=async()=>{
 const file=$('resource-pdf').files?.[0],message=$('resource-status');
 if(!file){message.textContent='Choose a PDF first.';return}
 if(domain.value!=='course'||!course.value){message.textContent='Select My course and choose the course before uploading.';return}
 if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){message.textContent='PDF files only.';return}
 if(file.size>1800000||file.size<8){message.textContent='PDF must be under 1.8 MB.';return}
 const button=$('upload-resource');button.disabled=true;message.textContent='Uploading PDF…';
 try{
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read PDF.'));reader.readAsDataURL(file)});
  const result=await api('/api/course-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:course.value,name:file.name,data})});
  message.textContent='Uploaded privately: '+result.file.name+'. To use the file as generation material, open Course Studio and select it under Teaching material.';
  $('resource-pdf').value='';
 }catch(e){message.textContent=e.message}finally{button.disabled=false}
};
$('interpret').onclick=async()=>{
 const request=$('natural-request').value.trim(),message=$('interpret-status');
 message.textContent='Interpreting request…';say('You',request);pending=null;$('apply').disabled=true;
 try{
  const response=await api('/api/assistant/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request,domain:domain.value})});
  const suggestion=response.suggestion;
  if(domain.value==='portfolio'){
   const candidate=suggestion.section+':'+suggestion.operation;
   if(!ops.portfolio.some(x=>x.value===candidate))throw Error('Unsupported portfolio action.');
   action.value=candidate;
   $('title').value=suggestion.entry?.title||'';
   $('content').value=suggestion.entry?.description||'';
   $('position').value=Number.isInteger(suggestion.index)?suggestion.index+1:1;
  }else{
   if(!ops.course.some(x=>x.value===suggestion.operation))throw Error('Unsupported course action.');
   action.value=suggestion.operation;
   $('title').value=suggestion.title||'';
   $('content').value=suggestion.content||'';
   $('chapter').value=Number.isInteger(suggestion.chapterIndex)?suggestion.chapterIndex+1:1;
   $('position').value=Number.isInteger(suggestion.lessonIndex)?suggestion.lessonIndex+1:1;
  }
  message.textContent='Suggested action populated. Check all fields, then click Preview change. No edits saved.';say('Assistant','I suggested '+suggestion.operation+' for '+domain.value+'. Review all populated fields and preview before saving.');
 }catch(e){message.textContent=e.message;say('Assistant','I could not interpret that request: '+e.message)}
};
$('preview').onclick=async()=>{try{const op=build(),result=await api(op.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op.data)});pending={...op,expectedUpdated:result.expectedUpdated};$('result').textContent=JSON.stringify(result,null,2);renderVisual(result,$('visual-preview'));$('apply').disabled=false;status.textContent='Preview ready. Review before saving.'}catch(e){pending=null;$('apply').disabled=true;status.textContent=e.message}};
$('apply').onclick=async()=>{if(!pending)return;const planned=pending;$('apply').disabled=true;try{const result=await api(planned.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...planned.data,expectedUpdated:planned.expectedUpdated,confirm:true})});pending=null;$('result').textContent=JSON.stringify(result,null,2);status.textContent='Saved. Preview the updated page.';say('Assistant','Your approved edit was saved.');if(result.url){$('open-resource').href=result.url;$('open-resource').hidden=false}await history()}catch(e){status.textContent=e.message}};
async function history(){const result=await api('/api/assistant/history');$('history').replaceChildren();for(const c of result.changes){const p=document.createElement('p');p.textContent=new Date(Number(c.created)).toLocaleString()+' · '+c.domain+' · '+c.operation;$('history').append(p)}}
$('reload-history').onclick=()=>history().catch(e=>status.textContent=e.message);domain.onchange=renderOps;action.onchange=()=>{$('apply').disabled=true;pending=null};renderOps();init();connectorStatus();
})();