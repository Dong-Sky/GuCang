import JSZip from 'jszip';
import type { SupabaseClient } from '../collection/types';
import { readAllPages } from '../collection/pagination';
export type Rows = Record<string, unknown>[];
export type Snapshot = { version: number; householdId: string; capturedAt: string; tables: Record<string, Rows> };
export const backupTables = ['households','household_members','household_invites','ips','characters','categories','series','locations','item_styles','item_style_characters','item_instances','item_images','location_images','movement_events','activity_events'] as const;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export function validateSnapshot(s: Snapshot, householdId: string) {
 if(!record(s)||s.version!==2||s.householdId!==householdId||!identifier(s.capturedAt)||!Number.isFinite(Date.parse(s.capturedAt))||!record(s.tables))throw new Error('备份结构无效');
 if(Object.keys(s.tables).length!==backupTables.length||backupTables.some(t=>!Object.hasOwn(s.tables,t)||!Array.isArray(s.tables[t])))throw new Error('备份缺少必需数据表或包含未知数据表');
 for(const table of backupTables){const seen=new Set<string>();for(const row of s.tables[table]){
  if(!record(row))throw new Error('数据行格式错误：'+table);
  const fields=table==='household_members'?['user_id']:table==='item_style_characters'?['item_style_id','character_id']:['id'];
  if(fields.some(f=>!identifier(row[f])))throw new Error('数据行缺少标识：'+table);
  const key=JSON.stringify(fields.map(f=>row[f]));if(seen.has(key))throw new Error('重复数据行：'+table);seen.add(key);
  if(table!=='households'&&table!=='item_style_characters'&&row.household_id!==householdId)throw new Error('数据不属于当前谷仓：'+table);
 }
 }
 if(s.tables.households.length!==1||s.tables.households[0].id!==householdId)throw new Error('谷仓记录不完整');
 const refs: Record<string, [string,string,boolean][]>={characters:[['ip_id','ips',true]],series:[['ip_id','ips',false]],locations:[['parent_id','locations',false]],item_styles:[['ip_id','ips',false],['category_id','categories',false],['series_id','series',false]],item_style_characters:[['item_style_id','item_styles',true],['character_id','characters',true]],item_instances:[['item_style_id','item_styles',true],['current_location_id','locations',false],['home_location_id','locations',false]],item_images:[['item_style_id','item_styles',true]],location_images:[['location_id','locations',true]],movement_events:[['item_instance_id','item_instances',true],['from_location_id','locations',false],['to_location_id','locations',false],['reverses_event_id','movement_events',false]]};
 for(const [table,fields] of Object.entries(refs))for(const [field,target,required] of fields){const ids=new Set(s.tables[target].map(r=>r.id));for(const row of s.tables[table])if((required||row[field]!=null)&&!ids.has(row[field]))throw new Error('备份关联不完整：'+table+'.'+field);}
 for(const row of [...s.tables.item_images,...s.tables.location_images])for(const field of ['detail_path','thumbnail_path']){if(!identifier(row[field]))throw new Error('照片路径缺失');validatePath(row[field],householdId);}
}
export async function readSnapshot(client: SupabaseClient, householdId: string): Promise<Snapshot> {
    const entries: Record<string, unknown[]> = {};
    const queries = [
      ["households", client.from("households").select("*").eq("id", householdId)],
      ["household_members", client.from("household_members").select("*").eq("household_id", householdId)],
      ["household_invites", client.from("household_invites").select("id,household_id,email,role,expires_at,accepted_at,invited_by,created_at").eq("household_id", householdId)],
      ["ips", client.from("ips").select("*").eq("household_id", householdId)],
      ["characters", client.from("characters").select("*").eq("household_id", householdId)],
      ["categories", client.from("categories").select("*").eq("household_id", householdId)],
      ["series", client.from("series").select("*").eq("household_id", householdId)],
      ["locations", client.from("locations").select("*").eq("household_id", householdId)],
      ["item_styles", client.from("item_styles").select("*").eq("household_id", householdId)],
      ["item_style_characters", client.from("item_style_characters").select("item_style_id,character_id,sort_order,item_styles!inner(household_id)").eq("item_styles.household_id", householdId)],
      ["item_instances", client.from("item_instances").select("*").eq("household_id", householdId)],
      ["item_images", client.from("item_images").select("*").eq("household_id", householdId)],
      ["location_images", client.from("location_images").select("*").eq("household_id", householdId)],
      ["movement_events", client.from("movement_events").select("*").eq("household_id", householdId)],
      ["activity_events", client.from("activity_events").select("*").eq("household_id", householdId)],
    ] as const;
    for (const [table, query] of queries) {
      const ordered = table === "household_members" ? query.order("user_id") : table === "item_style_characters" ? query.order("item_style_id").order("character_id") : query.order("id");
      entries[table] = await readAllPages<Record<string, unknown>>(async (from, to) => {
        const result = await ordered.range(from, to);
        return { data: result.data as Record<string, unknown>[] | null, error: result.error };
      });
    }

return {version:2,householdId,capturedAt:new Date().toISOString(),tables:entries as Record<string,Rows>};
}
export const sha256 = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).map(n=>n.toString(16).padStart(2,'0')).join('');
export const pathsFor = (s: Snapshot) => [...new Set([...(s.tables.item_images??[]),...(s.tables.location_images??[])].flatMap(r=>[r.detail_path,r.thumbnail_path]).filter((p):p is string=>typeof p==='string'&&p.length>0))];
export function validatePath(p:string,h:string) { if(!p.startsWith('households/'+h+'/')||p.includes('..')||p.includes('\\')||p.startsWith('/')) throw new Error('备份图片路径不属于当前谷仓'); }
export type BackupSession = {snapshot:Snapshot; files:Map<string,Uint8Array>};
export async function makeArchive(session:BackupSession,download:(p:string)=>Promise<Uint8Array>,report:(s:string)=>void) {
 validateSnapshot(session.snapshot,session.snapshot.householdId);
 const zip=new JSZip(),missing:string[]=[],checksums:Record<string,string>={};
 const paths=pathsFor(session.snapshot);let total=0;
 for(const p of paths) {validatePath(p,session.snapshot.householdId);report('读取图片 '+(++total)+' / '+paths.length);
  if(!session.files.has(p))try{const bytes=await download(p);const row=[...(session.snapshot.tables.item_images??[]),...(session.snapshot.tables.location_images??[])].find(r=>r.detail_path===p||r.thumbnail_path===p);const expected=Number(row?.[row.detail_path===p?'file_size_bytes':'thumbnail_size_bytes']);if(expected>0&&bytes.length!==expected)throw new Error('图片大小不一致');session.files.set(p,bytes);}catch{missing.push(p);}
  if([...session.files.values()].reduce((n,b)=>n+b.length,0)>200*1024*1024)throw new Error('图片超过此浏览器备份的200MB安全限额，请使用本地完整备份流程');
 }
 const put=async(p:string,b:Uint8Array)=>{checksums[p]=await sha256(b);zip.file(p,b);};
 await put('data.json',new TextEncoder().encode(JSON.stringify(session.snapshot)));
 const cell=(v:unknown)=>{let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);if(typeof v==='string'&&/^[=+@\-\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 for(const [name,rows] of Object.entries(session.snapshot.tables)){const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];await put(name+'.csv',new TextEncoder().encode('\ufeff'+[cols.map(cell).join(','),...rows.map(r=>cols.map(c=>cell(r[c])).join(','))].join('\r\n')));}
 for(const [p,b] of session.files)await put('images/'+p,b);
 zip.file('backup_manifest.json',JSON.stringify({version:2,householdId:session.snapshot.householdId,capturedAt:session.snapshot.capturedAt,complete:missing.length===0,missing,checksums,limitations:['仅业务数据与关联图片，不含登录密码、平台配置或未关联文件','读取期间请暂停编辑；不是跨表事务快照']}));
 report('正在打包');const bytes=await zip.generateAsync({type:'uint8array',compression:'STORE'},m=>report('打包 '+Math.round(m.percent)+'%'));
 return {bytes,missing};
}
export async function inspectArchive(bytes:Uint8Array,householdId:string,current:Snapshot) {
 if(bytes.length>250*1024*1024)throw new Error('此预览仅检查250MB以内的ZIP，大备份请用电脑离线校验');
 const zip=await JSZip.loadAsync(bytes);let expanded=0;
 for(const f of Object.values(zip.files)){const size=(f as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize??0;expanded+=size;if(size>30*1024*1024||expanded>300*1024*1024)throw new Error('备份解压体积超过安全限制');const original=(f as unknown as {unsafeOriginalName?:string}).unsafeOriginalName??f.name;if(original!==f.name||f.name.startsWith('/')||f.name.includes('..')||f.name.includes('\\'))throw new Error('不安全的备份路径');}
 const manifestFile=zip.file('backup_manifest.json');if(!manifestFile)throw new Error('缺少校验清单');
 const m=JSON.parse(await manifestFile.async('string'));
 if(!record(m)||m.version!==2||m.householdId!==householdId)throw new Error('不支持的备份版本或不是当前谷仓的备份');
 if(!record(m.checksums)||!m.checksums['data.json']||typeof m.complete!=='boolean'||!Array.isArray(m.missing)||m.missing.some(p=>typeof p!=='string')||new Set(m.missing).size!==m.missing.length)throw new Error('校验清单不完整');
 for(const [p,expected] of Object.entries(m.checksums)){const f=zip.file(p);if(!f||await sha256(await f.async('uint8array'))!==expected)throw new Error('文件校验失败：'+p);}
 const data=JSON.parse(await zip.file('data.json')!.async('string')) as Snapshot;
 validateSnapshot(data,householdId);
 const expectedPaths=new Set(pathsFor(data));
 for(const p of m.missing)if(!expectedPaths.has(p as string)||zip.file('images/'+p))throw new Error('缺图清单与文件不一致');
 for(const table of backupTables)if(!m.checksums[table+'.csv'])throw new Error('数据表CSV未纳入校验清单');
 const missing=m.missing as string[];
 const allowed=new Set(['data.json',...backupTables.map(t=>t+'.csv'),...[...expectedPaths].filter(p=>!missing.includes(p)).map(p=>'images/'+p)]);
 if(Object.keys(m.checksums).some(p=>!allowed.has(p))||Object.values(zip.files).some(f=>!f.dir&&f.name!=='backup_manifest.json'&&!allowed.has(f.name)))throw new Error('备份包含未声明的文件');
 if(data.version!==2||data.householdId!==householdId||!data.tables||!Array.isArray(m.missing))throw new Error('备份结构无效');
 for(const p of pathsFor(data)){validatePath(p,householdId);if(!m.missing.includes(p)&&!m.checksums['images/'+p])throw new Error('图片未纳入校验清单');}
 if(Boolean(m.complete)!==(m.missing.length===0))throw new Error('备份完整状态不一致');
 const key=(r:Record<string,unknown>)=>String(r.id??r.user_id??String(r.item_style_id)+':'+String(r.character_id));
 const canonical=(r:Record<string,unknown>)=>JSON.stringify(Object.entries(r).sort(([a],[b])=>a.localeCompare(b)));
 const diff=Object.entries(data.tables).map(([table,rows])=>{if(!Array.isArray(rows))throw new Error('数据表格式错误');const existing=new Map((current.tables[table]??[]).map(r=>[key(r),r]));return {table,backup:rows.length,current:existing.size,onlyBackup:rows.filter(r=>!existing.has(key(r))).length,different:rows.filter(r=>existing.has(key(r))&&canonical(r)!==canonical(existing.get(key(r))!)).length,onlyCurrent:[...existing.keys()].filter(id=>!rows.some(r=>key(r)===id)).length};});
 return {complete:m.complete as boolean,missing:m.missing.length as number,diff};
}
