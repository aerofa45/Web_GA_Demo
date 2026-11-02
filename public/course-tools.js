'use strict';
(function(root){
  function youtubeId(value){
    try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
      const host=u.hostname.toLowerCase();let id;
      if(host==='youtu.be')id=u.pathname.slice(1);
      else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){
        if(u.pathname==='/watch')id=u.searchParams.get('v');
        else id=/^\/(?:shorts|embed)\/([^/]+)$/.exec(u.pathname)?.[1];
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;
    }catch{return null;}
  }
  // Work on a copy so invalid replacements never partially mutate the editor.
  function applyGeneration(original,generated,target={scope:'course'}){
    const next=structuredClone(original),chapters=generated?.chapters;
    if(!Array.isArray(chapters)||!chapters.length)throw Error('No generated chapters were returned.');
    if(target.scope==='course'){next.chapters.push(...structuredClone(chapters));return next;}
    const current=next.chapters[target.chapter];
    if(!current||chapters.length!==1)throw Error('The generated replacement does not match the selected chapter.');
    if(target.scope==='lesson'){
      const lesson=current.lessons[target.lesson],replacement=chapters[0].lessons;
      if(!lesson||lesson.type==='youtube'||replacement?.length!==1||replacement[0].type!==lesson.type)throw Error('The generated replacement does not match the selected lesson.');
      current.lessons[target.lesson]={...lesson,title:replacement[0].title,content:replacement[0].content};
    }else if(target.scope==='chapter'){
      const editable=current.lessons.filter(l=>l.type!=='youtube'),replacement=chapters[0].lessons;
      if(!Array.isArray(replacement)||replacement.length!==editable.length||replacement.some((l,i)=>l.type!==editable[i].type))throw Error('The generated replacement does not match the chapter lessons.');
      let index=0;current.title=chapters[0].title;
      current.lessons=current.lessons.map(l=>l.type==='youtube'?l:{...l,title:replacement[index].title,content:replacement[index++].content});
    }else throw Error('Invalid generation target.');
    return next;
  }
  const api={youtubeId,applyGeneration};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CourseTools=api;
})(typeof window!=='undefined'?window:globalThis);
