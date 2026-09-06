import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {inspectArchive,sha256,makeArchive,backupTables,validateSnapshot,validatePath} from '../lib/collection/backup.ts';

test('restore preview must reject an empty-table backup claiming completeness',async()=>{
 const bytes=new TextEncoder().encode(JSON.stringify({version:2,householdId:'h',capturedAt:'2026-09-06',tables:{}}));
 const zip=new JSZip();zip.file('data.json',bytes);
 zip.file('backup_manifest.json',JSON.stringify({version:2,householdId:'h',complete:true,missing:[],checksums:{'data.json':await sha256(bytes)}}));
 const current={version:2,householdId:'h',capturedAt:'2026-09-06',tables:{item_instances:[{id:'existing'}]}};
 await assert.rejects(inspectArchive(await zip.generateAsync({type:'uint8array'}),'h',current),undefined,'Missing business tables must never pass as complete');
});

const valid=()=>({version:2,householdId:'h',capturedAt:'2026-09-06',tables:{...Object.fromEntries(backupTables.map(t=>[t,[]])),households:[{id:'h'}]}});
test('required tables, row identity, scope and references are enforced',()=>{
 for(const mutate of [s=>delete s.tables.locations,s=>s.tables.ips.push(null),s=>s.tables.ips.push({household_id:'h'}),s=>s.tables.ips.push({id:'i',household_id:'other'}),s=>s.tables.ips.push({id:'i',household_id:'h'},{id:'i',household_id:'h'}),s=>s.tables.item_instances.push({id:'i',household_id:'h',item_style_id:'absent'}),s=>s.tables.extra=[]]){const s=valid();mutate(s);assert.throws(()=>validateSnapshot(s,'h'));}
 assert.doesNotThrow(()=>validateSnapshot(valid(),'h'));
 assert.throws(()=>validatePath('households/h/a\\b','h'));
});
test('reject dishonest manifests, omitted CSVs, extra files and normalized traversal',async()=>{
 const s=valid();const full=await makeArchive({snapshot:s,files:new Map()},async()=>{throw Error('unexpected download');},()=>{});
 for(const mutate of [
  (z,m)=>{m.complete='true';},
  (z,m)=>{m.missing=['not-a-photo'];m.complete=false;},
  (z,m)=>{delete m.checksums['ips.csv'];z.remove('ips.csv');},
  z=>z.file('extra.txt','unverified'),
  z=>z.file('../escape.txt','unsafe'),
  z=>z.file('folder\\escape.txt','unsafe'),
 ]){const z=await JSZip.loadAsync(full.bytes),m=JSON.parse(await z.file('backup_manifest.json').async('string'));mutate(z,m);z.file('backup_manifest.json',JSON.stringify(m));await assert.rejects(inspectArchive(await z.generateAsync({type:'uint8array'}),'h',s));}
});
test('CSV protects spreadsheet formulas without changing ordinary text',async()=>{
 const s=valid();s.tables.ips=['=1+1','-1+1','@SUM(1)','\t=1','normal','test','return'].map((name,i)=>({id:String(i),household_id:'h',name}));
 const a=await makeArchive({snapshot:s,files:new Map()},async()=>new Uint8Array(),()=>{}),z=await JSZip.loadAsync(a.bytes),csv=await z.file('ips.csv').async('string');
 for(const text of ['=1+1','-1+1','@SUM(1)','\t=1'])assert.ok(csv.includes('"\''+text+'"'));
 for(const text of ['normal','test','return'])assert.ok(csv.includes('"'+text+'"'));
});
