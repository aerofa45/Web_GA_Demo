'use strict';

// Shared boundary for instructor saves and untrusted model responses.
function validateOutline(outline,{generated=false}={}) {
  const invalid=()=>{throw Error('Invalid course outline.');};
  if(!outline||!Array.isArray(outline.chapters)||outline.chapters.length>(generated?20:60)||(generated&&!outline.chapters.length))invalid();
  for(const ch of outline.chapters){
    if(!ch||typeof ch.title!=='string'||!ch.title.trim()||ch.title.length>180||!Array.isArray(ch.lessons)||ch.lessons.length>80||(generated&&!ch.lessons.length))invalid();
    for(const l of ch.lessons){
      if(!l||typeof l.title!=='string'||!l.title.trim()||l.title.length>180||typeof l.content!=='string'||l.content.length>20000||!['text','youtube','quiz'].includes(l.type))invalid();
      if(generated&&(l.pdfId!==undefined||!l.content.trim()||l.type==='youtube'))invalid();
      if(l.pdfId!==undefined&&!/^[a-f0-9]{48}$/.test(l.pdfId))invalid();
      if(l.pdfName!==undefined&&(typeof l.pdfName!=='string'||l.pdfName.length>160))invalid();
      if(l.type==='youtube'&&l.content&&!/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}(?:[&#?].*)?$/.test(l.content))invalid();
    }
  }
  if(JSON.stringify(outline).length>240000)invalid();
  return outline;
}
module.exports={validateOutline};
