'use strict';
(async()=>{const status=document.getElementById('status');try{
 const id=location.pathname.split('/').pop(),response=await fetch('/api/course-view/'+id,{credentials:'same-origin'}),data=await response.json();if(!response.ok)throw Error(data.error||'Course unavailable.');
 const themeSelect=document.getElementById('theme-choice'),themeControls=document.getElementById('theme-controls');
 const allowedThemes=new Set(['midnight','daylight','forest']);
 const requestedTheme=new URLSearchParams(location.search).get('theme');
 const savedTheme=data.owner?sessionStorage.getItem('forma-preview-theme-'+id):null;
 const initialTheme=allowedThemes.has(requestedTheme)?requestedTheme:allowedThemes.has(savedTheme)?savedTheme:'midnight';
 document.body.dataset.courseTheme=initialTheme;themeSelect.value=initialTheme;
 if(data.owner){
  themeControls.hidden=false;
  themeSelect.addEventListener('change',()=>{
   const selected=themeSelect.value;if(!allowedThemes.has(selected))return;
   document.body.dataset.courseTheme=selected;sessionStorage.setItem('forma-preview-theme-'+id,selected);
   const url=new URL(location.href);url.searchParams.set('theme',selected);history.replaceState(null,'',url.pathname+url.search);
  });
 }
 document.getElementById('title').textContent=data.course.title;document.title=data.course.title+' | Forma Studio';status.textContent=data.course.published?'Published course': 'Private instructor preview';
 if(!data.owner){const section=document.createElement('section');const heading=document.createElement('h2');heading.textContent='Sandbox course subscription';section.append(heading);const message=document.createElement('p');message.textContent='Checking test subscription...';section.append(message);const subscribe=document.createElement('button');subscribe.type='button';subscribe.textContent='Subscribe using Stripe test checkout';subscribe.hidden=true;subscribe.onclick=async()=>{subscribe.disabled=true;try{const response=await fetch('/api/stripe-test/subscription-checkout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:id})}),result=await response.json();if(!response.ok)throw Error(result.error||'Unable to open test checkout');location.assign(result.url)}catch(error){message.textContent=error.message;subscribe.disabled=false}};section.append(subscribe);document.getElementById('content').append(section);try{const r=await fetch('/api/stripe-test/subscription-status?courseId='+encodeURIComponent(id),{credentials:'same-origin'});if(r.ok){const x=await r.json();message.textContent='Test subscription: '+x.status+'. Purchase does not automatically grant course access.';subscribe.hidden=x.status==='active'}else{message.textContent='Sign in to see test subscription options.'}}catch(e){message.textContent='Subscription status unavailable.'}}
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
 const lms=document.createElement('section');lms.id='lms-student';document.getElementById('content').append(lms);const lmsScript=document.createElement('script');lmsScript.src='/lms-student.js';lmsScript.defer=true;document.body.append(lmsScript);
 const tabLesson=document.getElementById('tab-lesson'),tabClasswork=document.getElementById('tab-classwork');
 const lessonWorkspace=document.getElementById('lesson-workspace'),classwork=document.getElementById('content');
 function showTab(which){
  const isLesson=which==='lesson';
  lessonWorkspace.hidden=!isLesson;classwork.hidden=isLesson;
  tabLesson.setAttribute('aria-selected',String(isLesson));tabClasswork.setAttribute('aria-selected',String(!isLesson));
  if(!isLesson)classwork.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 tabLesson.addEventListener('click',()=>showTab('lesson'));tabClasswork.addEventListener('click',()=>showTab('classwork'));
 for(const tab of [tabLesson,tabClasswork])tab.addEventListener('keydown',event=>{
  if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
  event.preventDefault();const target=tab===tabLesson?tabClasswork:tabLesson;target.focus();showTab(target===tabLesson?'lesson':'classwork');
 });
 const chapters=data.course.outline.chapters||[],lessons=chapters.flatMap((chapter,ci)=>(chapter.lessons||[]).map((lesson,li)=>({lesson,chapter,ci,li})));
 const curriculum=document.getElementById('curriculum-list'),body=document.getElementById('lesson-content'),prev=document.getElementById('prev-lesson'),next=document.getElementById('next-lesson');
 const heading=document.getElementById('active-lesson-title'),counter=document.getElementById('lesson-count'),progress=document.getElementById('curriculum-progress');
 const progressFill=document.getElementById('curriculum-progress-fill'),nodes=[];
 const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
 let current=0;
 chapters.forEach((chapter,ci)=>{
  const group=document.createElement('div');group.className='learn-chapter';
  const title=text('div',chapter.title);title.className='learn-chapter-title';group.append(title);
  (chapter.lessons||[]).forEach((lesson,li)=>{
   const index=lessons.findIndex(item=>item.ci===ci&&item.li===li),button=document.createElement('button');button.type='button';button.className='learn-lesson-link';
   const number=text('span',String(index+1).padStart(2,'0'));number.className='learn-lesson-number';
   button.append(number,text('span',lesson.title));button.addEventListener('click',()=>select(index));group.append(button);nodes[index]=button;
  });curriculum.append(group);
 });
 function select(index){
  if(index<0||index>=lessons.length)return;
  current=index;const item=lessons[index],lesson=item.lesson;
  heading.textContent=lesson.title;counter.textContent='LESSON '+(index+1)+' OF '+lessons.length;
  progress.textContent='Viewing lesson '+(index+1)+' of '+lessons.length+' • '+chapters.length+' sections';
  progressFill.style.width=((index+1)/lessons.length*100)+'%';
  body.replaceChildren();
  if(lesson.type==='youtube'){
   const video=CourseTools.youtubeId(lesson.content);
   if(video){const frame=document.createElement('iframe');frame.src='https://www.youtube-nocookie.com/embed/'+video;frame.title=lesson.title;frame.loading='lazy';frame.allow='fullscreen; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';body.append(frame);}
   else body.append(text('p','Video URL unavailable.'));
  }else body.append(text('p',lesson.content||'Lesson content coming soon.'));
  if(lesson.hasDriveVideo){
   const button=text('button','Open private Drive video');button.type='button';button.className='learn-btn';
   button.addEventListener('click',async()=>{const tab=window.open('about:blank','_blank');try{
    const r=await fetch('/api/course-video/'+id+'/'+item.ci+'/'+item.li,{credentials:'same-origin'}),result=await r.json();
    if(!r.ok)throw Error(result.error||'Video unavailable');if(tab){tab.opener=null;tab.location.replace(result.url);}
    else{const link=text('a','Open Google Drive video');link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';body.append(link);}
   }catch(e){if(tab)tab.close();body.append(text('p',e.message));}});
   body.append(button);
  }
  if(data.owner&&lesson.pdfId){const link=text('a','View instructor PDF');link.href='/api/course-pdf/'+lesson.pdfId;link.target='_blank';link.rel='noopener';body.append(link);}
  nodes.forEach((node,i)=>{if(node){if(i===index)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');}});
  prev.disabled=index===0;next.disabled=index===lessons.length-1;
  try{const url=new URL(location.href);url.searchParams.set('lesson',String(index+1));history.replaceState(null,'',url.pathname+url.search);}catch(e){}
 }
 prev.addEventListener('click',()=>select(current-1));next.addEventListener('click',()=>select(current+1));
 if(lessons.length){const requested=Number(new URLSearchParams(location.search).get('lesson'));select(Number.isInteger(requested)&&requested>=1&&requested<=lessons.length?requested-1:0);}
 else{heading.textContent='No lessons yet';body.append(text('p','The instructor has not added lessons to this course.'));prev.disabled=true;next.disabled=true;}

 }catch(e){status.textContent=e.message;}})();
