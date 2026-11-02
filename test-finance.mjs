import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'forma-finance-'));
const port=32000+Math.floor(Math.random()*1000);
const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,DATA_DIR:dir,PORT:String(port),FORMA_ADMIN_EMAIL:'owner@forma.test'},stdio:'ignore'});
const base=`http://127.0.0.1:${port}`;
async function req(route,method='GET',body,cookie){const r=await fetch(base+route,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,json:await r.json(),cookie:r.headers.get('set-cookie')}};
try{
 for(let i=0;i<50;i++){try{await fetch(base+'/api/payment-connectors');break}catch{await new Promise(r=>setTimeout(r,100))}}
 await test('payment connectors are truthful',async()=>{let r=await req('/api/payment-connectors');assert.equal(r.status,200);assert.equal(r.json.connectors.find(x=>x.code==='khalti').mode,'not_integrated')});
 let token;
 await test('register and block nonexistent earnings withdrawal',async()=>{let x=await req('/api/register','POST',{name:'Test Creator',email:'creator@example.com',slug:'creator-example',password:'a-Strong-Test-Passphrase-123'});assert.equal(x.status,201);token=x.cookie?.split(';')[0];assert.ok(token);let earnings=await req('/api/earnings','GET',null,token);assert.equal(earnings.status,200);assert.equal(earnings.json.available.NPR,0);let r=await req('/api/withdrawals','POST',{currency:'NPR',amount:100},token);assert.equal(r.status,400)});
 await test('other accounts cannot view payouts',async()=>{let r=await req('/api/admin/withdrawals','GET',null,token);assert.equal(r.status,403)});
 await test('unauthenticated cannot request withdrawals',async()=>{let r=await req('/api/withdrawals','POST',{currency:'NPR',amount:5});assert.equal(r.status,401)});
} finally{child.kill();rmSync(dir,{recursive:true,force:true})}
