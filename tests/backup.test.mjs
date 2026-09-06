import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {makeArchive,inspectArchive} from '../lib/collection/backup.ts';
const p='households/h/items/s/a.webp';
const snapshot={version:2,householdId:'h',capturedAt:'2026-09-06',tables:{item_images:[{id:'i',detail_path:p,file_size_bytes:3}],item_instances:[{id:'a',name:'old'}]}};
test('partial archive retry reuses verified images; round trip yields read-only diff',async()=>{
 const session={snapshot,files:new Map()};let calls=0;
 const partial=await makeArchive(session,async()=>{calls++;throw Error('offline');},()=>{});
 assert.equal((await inspectArchive(partial.bytes,'h',snapshot)).complete,false);
 const full=await makeArchive(session,async()=>{calls++;return new Uint8Array([1,2,3]);},()=>{});
 const changed=structuredClone(snapshot);changed.tables.item_instances[0].name='new';
 const report=await inspectArchive(full.bytes,'h',changed);assert.equal(report.complete,true);assert.equal(report.diff.find(d=>d.table==='item_instances').different,1);
 await makeArchive(session,async()=>{throw Error('must reuse');},()=>{});assert.equal(calls,2);
 assert.equal(changed.tables.item_instances[0].name,'new');
 await assert.rejects(inspectArchive(full.bytes,'other',snapshot));
 const zip=await JSZip.loadAsync(full.bytes);zip.file('images/'+p,new Uint8Array([8,9,0]));
 await assert.rejects(inspectArchive(await zip.generateAsync({type:'uint8array'}),'h',snapshot),/校验失败/);
});
test('wrong image length remains partial and invalid scope rejected',async()=>{
 const a=await makeArchive({snapshot,files:new Map()},async()=>new Uint8Array([1]),()=>{});assert.equal(a.missing.length,1);
 const bad=structuredClone(snapshot);bad.tables.item_images[0].detail_path='households/other/a';
 await assert.rejects(makeArchive({snapshot:bad,files:new Map()},async()=>new Uint8Array(),()=>{}));
});
