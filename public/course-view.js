'use strict';
(async()=>{const status=document.getElementById('status');try{
 const id=location.pathname.split('/').pop(),response=await fetch('/api/course-view/'+id,{credentials:'same-origin'}),data=await response.json();if(!response.ok)throw Error(data.error||'Course unavailable.');
 document.getElementById('title').textContent=data.course.title;document.title=data.course.title+' | Forma Studio';status.textContent=data.course.published?'Published course': 'Private instructor preview';
 const enroll=async()=>{const r=await fetch('/api/course-enrollments/'+id,{credentials:'same-origin'});if(!r.ok)return null;return r.json();};
 const info=await enroll();
 if(info&&!data.owner){
  const verification=document.createElement('section'),label=document.createElement('p'),button=document.createElement('button');
  label.textContent='Checking verified Google email...';button.textContent='Verify email with Google';button.type='button';button.hidden=true;
  button.addEventListener('click',async()=>{
   try{const r=await fetch('/api/google/connect?role=student',{credentials:'same-origin'}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not start verification');location.assign(d.authorizationUrl);}catch(e){label.textContent=e.message;}
  });
  verification.append(label,button);document.getElementById('content').append(verification);
  try{const r=await fetch('/api/google/student-status',{credentials:'same-origin'}),d=await r.json();if(!r.ok)throw Error(d.error||'Verification unavailable');label.textContent=d.verified?'Verified Google email: '+d.email:'Verify ownership of '+d.email+' using Google before requesting private lessons.';button.hidden=!!d.verified;}catch(e){label.textContent=e.message;}
 }
 if(info&&!data.owner){
  const panel=document.createElement('section'),heading=document.createElement('h2');heading.textContent='Private video enrollment';panel.append(heading);
  const msg=document.createElement('p');msg.textContent='Your status: '+info.status;panel.append(msg);
  if(info.status==='none'){
   const button=document.createElement('button');button.textContent='Request instructor approval';
   button.addEventListener('click',async()=>{button.disabled=true;try{
    const r=await fetch('/api/course-enrollments/'+id+'/request',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
    const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');msg.textContent='Your status: '+d.status;button.remove();
   }catch(e){msg.textContent=e.message;button.disabled=false;}});
   panel.append(button);
  }
  document.getElementById('content').append(panel);
 }
 const root=document.getElementById('content'),text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
 for(const c of data.course.outline.chapters){const section=document.createElement('section');section.append(text('h2',c.title));for(const l of c.lessons){const article=document.createElement('article');article.append(text('h3',l.title));if(l.type==='youtube'){
 const video=CourseTools.youtubeId(l.content);if(video){const frame=document.createElement('iframe');frame.src='https://www.youtube-nocookie.com/embed/'+video;frame.title=l.title;frame.loading='lazy';frame.allow='fullscreen; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';article.append(frame);}else article.append(text('p','Video URL unavailable.'));
 }else article.append(text('p',l.content));
 if(l.hasDriveVideo){
  const privateLink=text('button','Open private Drive video');privateLink.type='button';
  privateLink.addEventListener('click',async()=>{
   const tab=window.open('about:blank','_blank');
   try{
    const r=await fetch('/api/course-video/'+id+'/'+data.course.outline.chapters.indexOf(c)+'/'+c.lessons.indexOf(l),{credentials:'same-origin'});
    const result=await r.json();if(!r.ok)throw Error(result.error||'Video unavailable');
    if(tab){tab.opener=null;tab.location.replace(result.url);}else{const link=text('a','Open Google Drive video');link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';article.append(link);}
   }catch(e){if(tab)tab.close();const m=text('p',e.message);article.append(m);}
  });article.append(privateLink);
 }
 if(data.owner&&l.pdfId){const link=text('a','View instructor PDF');link.href='/api/course-pdf/'+l.pdfId;link.target='_blank';link.rel='noopener';article.append(link);}section.append(article);}root.append(section);}
 }catch(e){status.textContent=e.message;}})();
