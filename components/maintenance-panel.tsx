"use client";
import {useRef,useState} from 'react';
import type {SupabaseClient,Workspace} from '@/lib/collection/types';
import {listMaintenance,runMaintenance,type MaintenanceJob} from '@/lib/collection/maintenance';
export function MaintenancePanel({client,workspace}:{client:SupabaseClient;workspace:Workspace}){
 const [jobs,setJobs]=useState<MaintenanceJob[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');const lock=useRef(false);
 if(workspace.member.role!=='admin')return null;
 const run=async(mode:'read'|'prepare'|'retry')=>{if(lock.current)return;if(mode==='prepare'&&!window.confirm('只清理进入回收站超过7天的收藏；此操作不可撤销。请先确认本地完整备份已保存。继续？'))return;lock.current=true;setBusy(true);setError('');try{setJobs(mode==='read'?await listMaintenance(client,workspace.household.id):await runMaintenance(client,workspace.household.id,mode==='prepare',setMessage));setMessage(mode==='read'?'已读取最近100条任务':'本批已处理，请查看失败任务；刷新页面更新收藏数量。每次最多处理20个款式/图片任务。');}catch(e){setError(e instanceof Error?e.message:'维护失败，可重试');}finally{lock.current=false;setBusy(false);}};
 return <section className="settings-card"><h2>到期回收站维护</h2><p>打开谷仓不会自动删除数据。仅管理员在确认备份后主动清理；图片失败任务保留在数据库，可下次重试，不扫描删除历史原图或未知文件。</p><div className="phase-action-row"><button className="secondary-button" disabled={busy} onClick={()=>void run('read')}>查看清理记录</button><button className="secondary-button" disabled={busy} onClick={()=>void run('retry')}>重试未完成图片</button><button className="danger-button" disabled={busy} onClick={()=>void run('prepare')}>清理到期回收站</button></div><p role="status">{message}</p>{error?<p role="alert">{error}</p>:null}{jobs.map(j=><p key={j.id}>{j.status==='done'?'已完成':j.status==='failed'?'失败，可重试':'待处理'} · {j.removed_instances} 件 · 图片文件 {j.paths.length} · 尝试 {j.attempts} 次 {j.last_error}</p>)}</section>;
}
