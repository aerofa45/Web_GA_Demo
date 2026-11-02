'use strict';
(async()=>{const status=document.getElementById('status');try{
 const id=location.pathname.split('/').pop(),response=await fetch('/api/course-view/'+id,{credentials:'same-origin'}),data=await response.json();if(!response.ok)throw Error(data.error||'Course unavailable.');
 document.getElementById('title').textContent=data.course.title;document.title=data.course.title+' | Forma Studio';status.textContent=data.course.published?'Published course': 'Private instructor preview';
 const root=document.getElementById('content'),text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
 for(const c of data.course.outline.chapters){const section=document.createElement('section');section.append(text('h2',c.title));for(const l of c.lessons){const article=document.createElement('article');article.append(text('h3',l.title));if(l.type==='youtube'){
 const video=CourseTools.youtubeId(l.content);if(video){const frame=document.createElement('iframe');frame.src='https://www.youtube-nocookie.com/embed/'+video;frame.title=l.title;frame.loading='lazy';frame.allow='fullscreen; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';article.append(frame);}else article.append(text('p','Video URL unavailable.'));
 }else article.append(text('p',l.content));
 if(data.owner&&l.pdfId){const link=text('a','View instructor PDF');link.href='/api/course-pdf/'+l.pdfId;link.target='_blank';link.rel='noopener';article.append(link);}section.append(article);}root.append(section);}
 }catch(e){status.textContent=e.message;}})();
