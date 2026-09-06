import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runMaintenance} from '../lib/collection/maintenance.ts';
test('startup never invokes recycle bin deletion',()=>{const source=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');assert.ok(!source.includes('purgeExpiredItems'));});
test('failed media jobs remain retryable, completed jobs skipped and scope guarded',async()=>{
 const job={id:'j',household_id:'h',paths:['households/h/a'],status:'pending',attempts:0};let removals=0,offline=true;const calls=[];
 const client={rpc:async(name,args)=>{calls.push(name);if(name==='list_maintenance')return {data:[job],error:null};if(name==='record_maintenance_attempt'){job.status=args.succeeded?'done':'failed';job.attempts++;}return {data:null,error:null};},storage:{from:()=>({remove:async()=>{removals++;return {error:offline?{message:'offline'}:null};}})}};
 await runMaintenance(client,'h',true,()=>{});assert.equal(job.status,'failed');assert.equal(job.attempts,1);offline=false;
 await runMaintenance(client,'h',false,()=>{});assert.equal(job.status,'done');assert.equal(job.attempts,2);
 await runMaintenance(client,'h',false,()=>{});assert.equal(removals,2);assert.equal(calls.filter(n=>n==='prepare_maintenance').length,1);
 job.status='pending';job.paths=['households/other/a'];await runMaintenance(client,'h',false,()=>{});assert.equal(job.status,'failed');assert.equal(removals,2);
});
