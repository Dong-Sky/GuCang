"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { browseCatalog } from '@/lib/collection/api';
import type { ItemView, SupabaseClient, Workspace } from '@/lib/collection/types';
import { emptyFind } from '@/lib/collection/find';
import { locationPath } from '@/lib/collection/model';
import { CollectionFilters } from './collection-filters';
import { PageHeader } from './page-header';
import { useBrowseMemory } from './browse-memory';

export function RemoteCatalog({client,workspace,search: externalSearch,onFull,renderItems}:{client:SupabaseClient;workspace:Workspace;search?:string;onFull:()=>Promise<boolean>;renderItems:(items:ItemView[],mode:'cards'|'list')=>ReactNode}) {
 const [search,setSearch]=useBrowseMemory('collection-search','');
 const [find,setFind]=useBrowseMemory('collection-find',emptyFind);
 const [location,setLocation]=useBrowseMemory('collection-location','');
 const [mode,setMode]=useBrowseMemory<'cards'|'list'>('collection-display','cards');
 const [,setGroup]=useBrowseMemory('collection-mode','all');
 const [page,setPage]=useBrowseMemory('remote-page',1);
 const [result,setResult]=useState<{items:ItemView[];total:number;page:number;key:string}|null>(null);
 const [error,setError]=useState(''),[retry,setRetry]=useState(0);
 const query=externalSearch??search;
 const key=JSON.stringify([workspace.household.id,query,externalSearch===undefined?find:emptyFind,externalSearch===undefined?location:'']);
 const [previous,setPrevious]=useState(key);const anchor=useRef<HTMLDivElement>(null);
 const requested=previous===key?page:1;
 useEffect(()=>{
  let live=true;setError('');
  const timer=setTimeout(()=>{
   const filters=externalSearch===undefined?{...find,location}:{};
   void browseCatalog(client,workspace,query,filters,requested).then(data=>{if(live){setPrevious(key);setPage(data.page);setResult({...data,key});}},()=>{if(live)setError('收藏读取失败，请重试；不会显示不完整的搜索结果。');});
  },200);
  return()=>{live=false;clearTimeout(timer);};
  // Browse memory setters are recreated by the existing hook; depend on values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[client,workspace,key,requested,retry]);
 const ready=result?.key===key&&result.page===requested;
 const total=ready?result.total:null;
 const go=(next:number)=>{setPage(next);anchor.current?.scrollIntoView({block:'start'});};
 return <div className={externalSearch===undefined?'page collection-page':'search-results'} ref={anchor}>
  <PageHeader title={externalSearch===undefined?'我的收藏':'搜索结果'} countLabel={total===null?'读取中…':`${total} 件`} />
  {externalSearch===undefined?<>
   <label className="global-search"><input type="search" aria-label="搜索收藏" placeholder="搜索 IP、角色、编号、位置" value={search} onChange={e=>setSearch(e.target.value)} />{search?<button className="text-button" onClick={()=>setSearch('')}>清空</button>:null}</label>
   <CollectionFilters items={[]} references={workspace} value={find} onChange={setFind}/>
   <div className="collection-primary-tabs" role="group" aria-label="收藏分组"><button className="active" aria-pressed="true">全部谷子</button><button onClick={()=>{setGroup('ip');void onFull();}}>按 IP</button></div>
  </>:null}
  <div className="collection-secondary-toolbar">{externalSearch===undefined?<label className="location-filter"><select aria-label="按位置筛选" value={location} onChange={e=>setLocation(e.target.value)}><option value="">全部位置</option>{workspace.locations.map(l=><option key={l.id} value={l.id}>{locationPath(l.id,workspace.locations)}</option>)}</select></label>:<span/>}<div className="search-view-toggle" role="group" aria-label="显示方式"><button className={mode==='cards'?'active':''} aria-pressed={mode==='cards'} onClick={()=>setMode('cards')}>卡片</button><button className={mode==='list'?'active':''} aria-pressed={mode==='list'} onClick={()=>setMode('list')}>列表</button></div></div>
  {externalSearch===undefined?<div className="batch-toolbar"><button className="secondary-button" onClick={()=>void onFull()}>缺失资料筛选 / 批量整理</button></div>:null}
  {error?<p role="alert">{error}<button className="secondary-button" onClick={()=>setRetry(v=>v+1)}>重试</button></p>:!ready?<p role="status">正在读取收藏…</p>:<>
   {result.items.length?renderItems(result.items,mode):<p className="empty-state">没有找到收藏，试试其他关键词或筛选。</p>}
   {result.total>24?<nav className="pagination" aria-label="收藏列表分页"><p>第 {(result.page-1)*24+1}–{Math.min(result.page*24,result.total)} 项，共 {result.total} 项</p><div className="pagination-controls"><button disabled={result.page===1} onClick={()=>go(result.page-1)}>上一页</button><span>{result.page} / {Math.ceil(result.total/24)}</span><button disabled={result.page*24>=result.total} onClick={()=>go(result.page+1)}>下一页</button></div></nav>:null}
  </>}
 </div>;
}
