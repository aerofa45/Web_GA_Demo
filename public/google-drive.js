'use strict';
(async()=>{
const status=document.getElementById('drive-status'),selected=document.getElementById('drive-file');
const say=x=>status.textContent=x;
async function call(url,options){const response=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Google Drive request failed');return data;}
async function refresh(){try{const data=await call('/api/google/status');say(data.connected?'Connected: '+data.email:'Google Drive not connected.');}catch(e){say(e.message);}}
document.getElementById('drive-connect').addEventListener('click',async()=>{try{const data=await call('/api/google/connect');location.assign(data.authorizationUrl);}catch(e){say(e.message);}});
document.getElementById('drive-select').addEventListener('click',async()=>{
try{
say('Preparing Google Picker...');
const config=await call('/api/google/picker-config');
if(!window.gapi)throw Error('Google Picker script did not load. Refresh the page.');
await new Promise((resolve,reject)=>gapi.load('picker',{callback:resolve,onerror:reject,timeout:12000,ontimeout:()=>reject(Error('Google Picker timeout.'))}));
const view=new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes('video/mp4,video/webm,video/quicktime,video/x-matroska');
const builder=new google.picker.PickerBuilder().addView(view).setOAuthToken(config.accessToken).setDeveloperKey(config.apiKey).setOrigin(location.origin)
.setCallback(async event=>{
if(event.action!==google.picker.Action.PICKED)return;
const id=event.docs?.[0]?.id;if(!id)return;
try{const data=await call('/api/google/selected-file',{method:'POST',body:JSON.stringify({fileId:id})});selected.textContent='Selected video: '+data.file.name+'. Student access is not enabled yet.';say('Google Drive selection verified.');}catch(e){say(e.message);}
});
if(!config.appId)throw Error('GOOGLE_PROJECT_NUMBER is missing. Add the numeric Google Cloud project number in Render to authorize Picker selections with drive.file.');
builder.setAppId(config.appId);
builder.build().setVisible(true);
say('Select one video from Google Drive.');
}catch(e){say(e.message);}
});
refresh();
})();