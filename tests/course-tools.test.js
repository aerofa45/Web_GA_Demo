'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {youtubeId,applyGeneration}=require('../public/course-tools');
const {validateOutline}=require('../course');
test('YouTube URLs are normalized without accepting lookalike hosts or unsafe schemes',()=>{
 const id='dQw4w9WgXcQ';
 for(const url of ['https://youtu.be/'+id+'?t=3','https://www.youtube.com/watch?v='+id+'&t=3','https://m.youtube.com/shorts/'+id,'https://youtube.com/embed/'+id])assert.equal(youtubeId(url),id);
 for(const url of ['http://youtu.be/'+id,'https://youtube.com.evil.test/watch?v='+id,'https://youtube.com@evil.test/watch?v='+id,'javascript:alert(1)','https://youtu.be/'+id+'/extra','https://youtu.be:444/'+id,'https://example.test/'+id])assert.equal(youtubeId(url),null);
 validateOutline({chapters:[{title:'C',lessons:[{title:'V',type:'youtube',content:'https://youtube.com/shorts/'+id}]}]});
});
test('lesson and chapter regeneration preserve attachments, videos, and other chapters atomically',()=>{
 const original={chapters:[{title:'Original',lessons:[{title:'A',type:'text',content:'Old',pdfId:'d'.repeat(48),pdfName:'notes.pdf'},{title:'Video',type:'youtube',content:'https://youtu.be/dQw4w9WgXcQ'},{title:'Q',type:'quiz',content:'Old quiz'}]},{title:'Untouched',lessons:[]}]};
 const generated={chapters:[{title:'New',lessons:[{title:'New A',type:'text',content:'New explanation'}]}]};
 const one=applyGeneration(original,generated,{scope:'lesson',chapter:0,lesson:0});assert.equal(one.chapters[0].lessons[0].pdfName,'notes.pdf');assert.deepEqual(one.chapters[0].lessons.slice(1),original.chapters[0].lessons.slice(1));assert.deepEqual(one.chapters[1],original.chapters[1]);assert.equal(original.chapters[0].lessons[0].content,'Old');
 generated.chapters[0].lessons.push({title:'New Q',type:'quiz',content:'New quiz'});
 const chapter=applyGeneration(original,generated,{scope:'chapter',chapter:0});assert.deepEqual(chapter.chapters[0].lessons[1],original.chapters[0].lessons[1]);assert.equal(chapter.chapters[0].lessons[0].pdfId,'d'.repeat(48));assert.deepEqual(chapter.chapters[1],original.chapters[1]);
 assert.throws(()=>applyGeneration(original,{chapters:[]},{scope:'chapter',chapter:0}));assert.throws(()=>applyGeneration(original,generated,{scope:'lesson',chapter:0,lesson:0}));
 assert.equal(original.chapters[0].title,'Original');
});
