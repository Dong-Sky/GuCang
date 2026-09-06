"use client";
import {useEffect,useRef,useState} from 'react';
import type {SupabaseClient,Workspace} from '@/lib/collection/types';
import {readSnapshot,makeArchive,inspectArchive,type BackupSession} from '@/lib/collection/backup';

export function BackupPanel({client,workspace}:{client:SupabaseClient;workspace:Workspace}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [missing,setMissing]=useState<number|null>(null),[result,setResult]=useState<Awaited<ReturnType<typeof inspectArchive>>|null>(null);
 const session=useRef<BackupSession|null>(null),lock=useRef(false);
 const [remind,setRemind]=useState(false);
 useEffect(()=>{setRemind(!workspace.lastExportAt||Date.now()-Date.parse(workspace.lastExportAt)>30*86400000);},[workspace.lastExportAt]);
 useEffect(()=>{if(!busy)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[busy]);
 const exportZip=async(retry=false)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setResult(null);
  try{
   if(!retry||!session.current){setMissing(null);setMessage('正在读取业务数据，请暂时不要编辑收藏');session.current={snapshot:await readSnapshot(client,workspace.household.id),files:new Map()};}
   const archive=await makeArchive(session.current,async p=>{const signed=await client.storage.from('collection-images').createSignedUrl(p,300);if(signed.error||!signed.data?.signedUrl)throw new Error('图片签名失败');const r=await fetch(signed.data.signedUrl,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('图片下载失败');return new Uint8Array(await r.arrayBuffer());},setMessage);
   setMissing(archive.missing.length);const url=URL.createObjectURL(new Blob([new Uint8Array(archive.bytes)],{type:'application/zip'}));const a=document.createElement('a');a.href=url;a.download=`gucang-${archive.missing.length?'partial':'complete'}-${new Date().toISOString().replaceAll(':','-')}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   setMessage(archive.missing.length?`部分备份：缺 ${archive.missing.length} 个图片文件，可补下载后重新生成ZIP`:'完整业务备份已生成，请确认浏览器下载完成并妥善保存');
  }catch(e){setError(e instanceof Error?e.message:'导出失败');}finally{lock.current=false;setBusy(false);}
 };
 const inspect=async(file?:File)=>{if(!file||lock.current)return;lock.current=true;setBusy(true);setError('');setResult(null);try{if(file.size>250*1024*1024)throw new Error('请选择250MB以内的ZIP');setMessage('校验备份并只读比较当前数据…');const current=await readSnapshot(client,workspace.household.id);setResult(await inspectArchive(new Uint8Array(await file.arrayBuffer()),workspace.household.id,current));setMessage('校验完成：仅预览，不会写入或覆盖数据库');}catch(e){setError(e instanceof Error?e.message:'校验失败');}finally{lock.current=false;setBusy(false);}};
 return <section className="settings-card backup-panel"><h2>备份与恢复预览</h2><p>历史导出记录：{workspace.lastExportAt??'尚无'}。本预览不自动更新下载成功记录。</p>{remind?<p>建议每30天保存并检查一次完整备份。</p>:null}<p>完整业务备份包含记录及关联图片（含回收站/旧图），不含登录密码、平台配置或未关联文件。导出期间请暂停编辑；大量照片建议用电脑操作。</p><div className="phase-action-row"><button className="primary-button" disabled={busy||workspace.member.role!=='admin'} onClick={()=>void exportZip()}>生成新的 ZIP 备份</button>{missing!==null&&missing>0?<button className="secondary-button" disabled={busy} onClick={()=>void exportZip(true)}>补下载缺图</button>:null}</div><p role="status">{message}</p>{error?<p role="alert">{error}</p>:null}<p>补下载仅在当前页面保留，离开后需重新导出。生成不等于已保存到本机，请检查下载列表。</p><label>选择本轮新版 ZIP，校验并预览差异（不会恢复）<input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{void inspect(e.currentTarget.files?.[0]);e.currentTarget.value='';}} /></label>{result?<div><p>{result.complete?'完整性校验通过':'部分备份，不能视为完整恢复来源'} · 缺图 {result.missing}</p><p>下列数字仅为记录差异，不会自动合并或删除。</p>{result.diff.map(d=><p key={d.table}>{d.table}：备份 {d.backup} / 当前 {d.current}；仅备份 {d.onlyBackup}，不同 {d.different}，仅当前 {d.onlyCurrent}</p>)}</div>:null}</section>;
}
