'use strict';
(()=>{
 const root=document.getElementById('subscription-pricing');if(!root)return;
 let courseId='';
 const status=document.createElement('p');status.setAttribute('role','status');
 const picker=document.createElement('select');picker.setAttribute('aria-label','Choose course for subscription pricing');
 const label=document.createElement('label');label.textContent='Course to price ';label.append(picker);
 const form=document.createElement('form');
 form.innerHTML='<label>Billing interval <select name="interval"><option value="month">Monthly</option><option value="year">Yearly</option></select></label> <label>Price in USD cents <input type="number" min="100" max="10000000" step="1" name="amount" value="1000" required></label> <label><input type="checkbox" name="enabled"> Enable TEST subscriptions</label> <button type="submit">Save subscription price</button>';
 const amount=form.querySelector('[name=amount]'),interval=form.querySelector('[name=interval]'),enabled=form.querySelector('[name=enabled]');
 root.replaceChildren(label,form,status);
 async function request(url,opts){const r=await fetch(url,{credentials:'same-origin',...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Request failed ('+r.status+')');return d;}
 async function pricing(){if(!courseId){form.hidden=true;return;}form.hidden=false;status.textContent='Loading pricing...';try{const d=await request('/api/stripe-test/subscription-price/'+courseId);amount.value=d.price?.amount_cents??1000;interval.value=d.price?.interval||'month';enabled.checked=d.price?.enabled===true;status.textContent=d.price?'Current sandbox price loaded.':'No price set yet. Default is $10/month; subscriptions are OFF.';}catch(e){status.textContent='Pricing error: '+e.message;}}
 async function listCourses(){try{const data=await request('/api/course-drafts');const previous=courseId;picker.replaceChildren();for(const c of data.courses||[]){const o=document.createElement('option');o.value=c.id;o.textContent=c.title;picker.append(o)}courseId=(data.courses||[]).some(c=>c.id===previous)?previous:(data.courses||[])[0]?.id||'';picker.value=courseId;if(!courseId){form.hidden=true;status.textContent='Create a course first.';return;}await pricing();}catch(e){status.textContent='Unable to load courses: '+e.message;}}
 picker.addEventListener('change',()=>{courseId=picker.value;pricing()});
 window.addEventListener('forma:course-selected',e=>{if(e.detail?.id&&[...picker.options].some(x=>x.value===e.detail.id)){courseId=e.detail.id;picker.value=courseId;pricing()}});
 form.addEventListener('submit',async e=>{e.preventDefault();const selected=courseId;status.textContent='Saving sandbox subscription price...';try{const d=await request('/api/stripe-test/subscription-price/'+selected,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountCents:Number(amount.value),interval:interval.value,enabled:enabled.checked})});status.textContent='Saved '+(d.price.amount_cents/100).toFixed(2)+' USD per '+d.price.interval+' — '+(d.price.enabled?'TEST subscriptions ON':'OFF');}catch(err){status.textContent='Save failed: '+err.message;}});
 listCourses();
})();
