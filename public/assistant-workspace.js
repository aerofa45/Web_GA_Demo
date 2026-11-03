'use strict';
(()=>{const $=id=>document.getElementById(id),domain=$('domain'),action=$('action'),course=$('course'),status=$('status');let pending=null;
const portfolios=['experience','education','research','projects','publications'];
let chatTurns=[];
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
  $('generate-pdf-id').value=result.file.id;
  message.textContent='Uploaded privately: '+result.file.name+'. PDF selected for course generation. You may now click Generate draft preview.';
  $('resource-pdf').value='';
 }catch(e){message.textContent=e.message}finally{button.disabled=false}
};
$('interpret').onclick=async()=>{
 const request=$('natural-request').value.trim(),message=$('interpret-status');
 message.textContent='Interpreting request…';say('You',request);pending=null;$('apply').disabled=true;
 try{
  const response=await api('/api/assistant/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request,domain:domain.value,history:chatTurns.slice(-8)})});
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
  chatTurns.push({role:'user',content:request},{role:'assistant',content:'Suggested '+suggestion.operation+' in '+domain.value+'; awaiting explicit preview and approval.'});
  chatTurns=chatTurns.slice(-8);
  message.textContent='Suggested action populated. Check all fields, then click Preview change. No edits saved.';say('Assistant','I suggested '+suggestion.operation+' for '+domain.value+'. Review all populated fields and preview before saving.');
 }catch(e){message.textContent=e.message;say('Assistant','I could not interpret that request: '+e.message)}
};
$('preview').onclick=async()=>{try{const op=build(),result=await api(op.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op.data)});pending={...op,expectedUpdated:result.expectedUpdated};$('result').textContent=JSON.stringify(result,null,2);renderVisual(result,$('visual-preview'));$('apply').disabled=false;status.textContent='Preview ready. Review before saving.'}catch(e){pending=null;$('apply').disabled=true;status.textContent=e.message}};
$('apply').onclick=async()=>{if(!pending)return;const planned=pending;$('apply').disabled=true;try{const result=await api(planned.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...planned.data,expectedUpdated:planned.expectedUpdated,confirm:true})});pending=null;$('result').textContent=JSON.stringify(result,null,2);status.textContent='Saved. Preview the updated page.';say('Assistant','Your approved edit was saved.');if(result.url){$('open-resource').href=result.url;$('open-resource').hidden=false}await history()}catch(e){status.textContent=e.message}};
async function history(){const result=await api('/api/assistant/history');$('history').replaceChildren();for(const c of result.changes){const p=document.createElement('p');p.textContent=new Date(Number(c.created)).toLocaleString()+' · '+c.domain+' · '+c.operation;$('history').append(p)}}
let generated=null,restorePending=null;
$('generate-course').onclick=async()=>{
 const message=$('generate-status');message.textContent='Generating a proposed course…';$('save-generated').disabled=true;generated=null;
 try{
  if(!course.value)throw Error('Select an instructor-owned course in the Request a change section first.');
  const current=await api('/api/course-drafts/'+course.value);
  const source=$('generate-notes').value.trim(),pdfId=$('generate-pdf-id').value.trim(),topic=$('generate-topic').value.trim();
  if(source.length<80&&!pdfId)throw Error('Provide at least 80 characters of notes or an uploaded PDF.');
  const result=await api('/api/course-generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:course.value,source,topic,...(pdfId?{pdfId}:{})})});
  const outline=result.outline;if(!outline||!Array.isArray(outline.chapters)||!outline.chapters.length)throw Error('No generated chapters returned.');
  generated={courseId:course.value,title:current.course.title,outline,expectedUpdated:current.course.updated};
  renderVisual({proposed:{title:generated.title,outline}},$('generated-preview'));
  $('generated-preview').hidden=false;$('save-generated').disabled=false;
  message.textContent='Preview ready. Review all generated lesson text and quiz answers. Saving will replace the current course outline, but will not publish it.';
  say('Assistant','I prepared '+outline.chapters.length+' chapters from your materials. Review before saving.');
 }catch(e){message.textContent=e.message;say('Assistant','Course generation could not complete: '+e.message);}
};
$('save-generated').onclick=async()=>{
 if(!generated)return;
 const item=generated;generated=null;$('save-generated').disabled=true;
 const message=$('generate-status');
 try{
  const out=await api('/api/assistant/course-generation/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});
  message.textContent='Generated draft saved privately. Open Course Studio to edit lessons or create assignments.';
  say('Assistant','Generated draft saved. Nothing was published.');
  await history();
 }catch(e){message.textContent=e.message;}
};
let assessmentsPending=null;
function renderAssessments(items){
 const area=$('assessment-preview');area.replaceChildren();
 const head=(tag,content,parent=area)=>{const node=document.createElement(tag);node.textContent=String(content);parent.append(node);return node};
 head('h3','Assignments ('+items.assignments.length+')');
 for(const assignment of items.assignments){
  head('h4',assignment.title);const para=head('p',assignment.instructions);para.style.whiteSpace='pre-wrap';
 }
 head('h3','Quizzes ('+items.quizzes.length+')');
 for(const quiz of items.quizzes){
  head('h4',quiz.title);
  quiz.questions.forEach((q,i)=>{
   head('p',(i+1)+'. '+q.prompt);
   const list=document.createElement('ol');
   for(const option of q.options){const li=document.createElement('li');li.textContent=option;list.append(li)}
   area.append(list);
   head('p','Correct answer: '+(q.correct+1)+' — '+q.options[q.correct]);
  });
 }
 area.hidden=false;
}
$('generate-assessments').onclick=async()=>{
 const status=$('assessment-status');assessmentsPending=null;$('save-assessments').disabled=true;
 $('assessment-preview').hidden=true;status.textContent='Generating assignments and quizzes…';
 try{
  if(!course.value)throw Error('Select your course under Request a change first.');
  const result=await api('/api/assistant/assessment-generation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:course.value,notes:$('assessment-notes').value})});
  assessmentsPending={courseId:result.courseId,assessments:result.assessments,previewToken:result.previewToken,confirm:true};
  renderAssessments(result.assessments);
  $('save-assessments').disabled=false;
  status.textContent='Preview ready. Check question wording and every correct answer before saving.';
  say('Assistant','Assignments and quizzes proposed. They are not yet saved.');
 }catch(e){status.textContent=e.message;say('Assistant','Assessment generation failed: '+e.message)}
};
$('save-assessments').onclick=async()=>{
 if(!assessmentsPending)return;
 const pending=assessmentsPending;assessmentsPending=null;$('save-assessments').disabled=true;
 try{
  const result=await api('/api/assistant/assessment-generation/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});
  $('assessment-status').textContent=result.replayed?'Assessments already saved; no duplicates created.':'Saved '+result.assignments+' assignment(s) and '+result.quizzes+' quiz(zes). Review them in Course Studio.';
  say('Assistant','Your generated assessments were saved to the LMS.');
  await history();
 }catch(e){$('assessment-status').textContent=e.message}
};
async function loadVersions(){
 const data=await api('/api/assistant/versions'),box=$('restore-version');box.replaceChildren();
 for(const v of data.versions||[]){
  const opt=document.createElement('option');opt.value=v.id;
  opt.textContent=v.domain+' · '+new Date(Number(v.created)).toLocaleString()+' · '+v.resource_id.slice(0,8);box.append(opt);
 }
}
$('preview-restore').onclick=async()=>{
 restorePending=null;$('confirm-restore').disabled=true;
 try{
  if(!$('restore-version').value)throw Error('No snapshots available yet.');
  const data=await api('/api/assistant/version/'+$('restore-version').value),v=data.version;
  restorePending={versionId:v.id,expectedUpdated:data.expectedUpdated,confirm:true};
  $('restore-status').textContent='Snapshot from '+new Date(Number(v.created)).toLocaleString()+': '+JSON.stringify(v.previous).slice(0,600)+'… Review before restoring.';
  $('confirm-restore').disabled=false;
 }catch(e){$('restore-status').textContent=e.message;}
};
$('confirm-restore').onclick=async()=>{
 if(!restorePending)return;
 const change=restorePending;restorePending=null;$('confirm-restore').disabled=true;
 try{await api('/api/assistant/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(change)});
  $('restore-status').textContent='Saved version restored. The previous current state was captured as a new version.';
  await history();await loadVersions();
 }catch(e){$('restore-status').textContent=e.message;}
};
$('reload-history').onclick=()=>history().catch(e=>status.textContent=e.message);domain.onchange=renderOps;action.onchange=()=>{$('apply').disabled=true;pending=null};renderOps();init();connectorStatus();loadVersions().catch(e=>$('restore-status').textContent=e.message);
})();