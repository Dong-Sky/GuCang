// Offline ZIP/media verification and SQL preparation. Never connects to a database.
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
const archive=path.resolve(process.argv[2]), destination=path.resolve(process.argv[3]);
assert.ok(destination.includes('Gucang-restore-drills'+path.sep));
const bytes=await fs.readFile(archive),zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
const sums=(await zip.file('SHA256SUMS.txt').async('string')).trim().split('\n');
await fs.mkdir(destination,{recursive:false});
let images=0;
for(const line of sums){const digest=line.slice(0,64),relative=line.slice(66);assert.match(digest,/^[0-9a-f]{64}$/);assert.ok(!relative.includes('\\')&&!relative.split('/').includes('..'));const filename=path.resolve(destination,relative);assert.ok(filename.startsWith(destination+path.sep));const file=zip.file(relative);assert.ok(file);const body=await file.async('nodebuffer');assert.equal(createHash('sha256').update(body).digest('hex'),digest);await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,body,{flag:'wx'});if(relative.startsWith('images/'))images++;}
const read=async p=>JSON.parse(await fs.readFile(path.join(destination,p),'utf8'));
const meta=await read('schema-metadata.json'),verification=await read('verification.json');
assert.equal(meta.project_ref,'kqverzchwolujdezoytf');assert.equal(verification.complete,true);assert.equal(images,verification.completedObjects);
const schema='phase5_restore_drill_20260906';const tables={};
for(const file of await fs.readdir(path.join(destination,'data')))if(file.endsWith('.json'))tables[file.slice(0,-5)]=await read('data/'+file);
const quote=s=>'"'+s.replaceAll('"','""')+'"';const literal=s=>"'"+s.replaceAll("'","''")+"'";
let sql=`begin; set local statement_timeout='60s'; create schema ${schema}; revoke all on schema ${schema} from public,anon,authenticated;\n`;
const definitions=await read('schema-definitions.json');
for(const name of new Set(definitions.enums.map(e=>e.type)))sql+=`create type ${schema}.${quote(name)} as enum (${definitions.enums.filter(e=>e.type===name).sort((a,b)=>a.sort_order-b.sort_order).map(e=>literal(e.label)).join(',')});\n`;
for(const [table,rows] of Object.entries(tables)){
 assert.match(table,/^[a-z_]+$/);
 const target=schema+'.'+quote(table);
 const sourceColumns=meta.columns.filter(c=>c.table_name===table).sort((a,b)=>a.ordinal_position-b.ordinal_position);
 const declaration=sourceColumns.map(c=>{const type=c.data_type==='USER-DEFINED'?schema+'.'+quote(c.udt_name):c.data_type==='ARRAY'?'pg_catalog.'+quote(c.udt_name.slice(1))+'[]':c.data_type;return quote(c.column_name)+' '+type+(c.is_generated==='ALWAYS'?' generated always as ('+c.generation_expression+') stored':'')+(c.is_nullable==='NO'?' not null':'');});
 sql+=`create table ${target} (${declaration.join(',')});\n`;
 const columns=meta.columns.filter(c=>c.table_name===table&&c.is_generated!=='ALWAYS').sort((a,b)=>a.ordinal_position-b.ordinal_position).map(c=>quote(c.column_name)).join(',');
 sql+=`insert into ${target} (${columns}) select ${columns} from jsonb_populate_recordset(null::${target},${literal(JSON.stringify(rows))}::jsonb);\n`;
 // Compare every restored field, not just row counts. Generated fields are included.
 sql+=`do $check$ begin if exists ((select to_jsonb(t) from ${target} t except all select value from jsonb_array_elements(${literal(JSON.stringify(rows))}::jsonb)) union all (select value from jsonb_array_elements(${literal(JSON.stringify(rows))}::jsonb) except all select to_jsonb(t) from ${target} t)) then raise exception 'Restore mismatch: ${table}'; end if; end $check$;\n`;
}
for(const c of meta.constraints.filter(c=>['p','u','c'].includes(c.type)))sql+=`alter table ${schema}.${quote(c.table_name)} add constraint ${quote(c.name)} ${c.definition.replaceAll('public.',schema+'.')};\n`;
let foreignKeys=0;
for(const c of meta.constraints.filter(c=>c.type==='f')){
 if(c.definition.includes('auth.'))continue; // Auth accounts/passwords are outside this business backup.
 const definition=c.definition.replace(/REFERENCES (?:public\.)?([a-z_]+)/,(_,table)=>{assert.ok(tables[table]);return 'REFERENCES '+schema+'.'+quote(table);});
 assert.ok(definition.includes('REFERENCES '+schema+'.'));
 sql+=`alter table ${schema}.${quote(c.table_name)} add constraint ${quote(c.name)} ${definition};\n`;foreignKeys++;
}
sql+=`select ${Object.keys(tables).length} as restored_tables,${verification.tables.item_instances} as restored_instances,${foreignKeys} as validated_foreign_keys,true as every_row_exact; rollback;`;
await fs.writeFile(path.join(destination,'restore-test-only.sql'),sql,{flag:'wx'});
await fs.writeFile(path.join(destination,'offline-verification.json'),JSON.stringify({archiveSha256:createHash('sha256').update(bytes).digest('hex'),files:sums.length,images,tables:Object.keys(tables).length,foreignKeys,zipCrc:true,allFileHashes:true,productionWrites:0,sqlTarget:'gucang-test only; transaction rollback',limitations:['Auth accounts and application triggers are not restored','Media restored to isolated local files, not cloud Storage']},null,2));
console.log(JSON.stringify({destination,files:sums.length,images,tables:Object.keys(tables).length,foreignKeys,sqlBytes:Buffer.byteLength(sql)}));
