import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startMockSupabase, TEST_USER } from './mock-supabase.mjs';
import { loadWorkspace } from '../lib/collection/api.ts';
import { batchEligibility, runBatch, matchesMissing } from '../lib/collection/batch.ts';
import { nextEntryDefaults } from '../lib/collection/entry.ts';

test('entry inheritance excludes identity, images and per-item text', () => {
  const fields = nextEntryDefaults({ip:'作品',category:'徽章',series:'系列',locationId:'box',quick:true,quality:'standard',name:'不可复制',character:'角色',notes:'私有备注',files:['photo'],styleId:'old',instanceId:'old'});
  assert.deepEqual(Object.keys(fields).sort(), ['category','ip','locationId','quality','quick','series']);
});

test('batch fills only missing fields, protects siblings and media, retries safely and returns individually', async () => {
  const f = await startMockSupabase({port:0,count:12});
  try {
    const client=createClient(f.url,'local-only',{auth:{persistSession:false,autoRefreshToken:false}});
    f.db.item_styles[0].category_id=null;
    let w=await loadWorkspace(client,f.db.households[0],TEST_USER);
    const first=w.items.find(i=>i.style.id===f.db.item_styles[0].id);
    const second=w.items.find(i=>i.style.id===f.db.item_styles[2].id);
    const history=f.state().historyHash;
    const action={field:'category',value:w.categories[0].id};
    const result=[];
    await runBatch(client,w,TEST_USER,[first.instance.id,second.instance.id],action,()=>{},r=>result.push(r));
    assert.deepEqual(result.map(r=>r.state),['done','skipped']);
    assert.equal(f.db.item_styles[0].category_id,action.value);
    assert.equal(f.state().historyHash,history);
    assert.equal(f.db.item_instances.length,12);
    assert.ok(!f.metrics.requests.some(r=>r.method==='DELETE'));
    f.db.item_styles[0].category_id=null;
    f.db.item_instances.push({...f.db.item_instances[0],id:'sibling'});
    w=await loadWorkspace(client,f.db.households[0],TEST_USER);
    assert.match(batchEligibility(w.items.find(i=>i.instance.id===first.instance.id),action,w,new Set([first.instance.id])),/未选中/);
    const noLocation=w.items.find(i=>i.instance.id===second.instance.id);
    assert.ok(matchesMissing(noLocation,'位置'));
    const locationResults=[];
    await runBatch(client,w,TEST_USER,[second.instance.id],{field:'location',value:w.locations[0].id},()=>{},r=>locationResults.push(r));
    assert.equal(locationResults[0].state,'done');
    const row=f.db.item_instances.find(i=>i.id===second.instance.id);
    assert.equal(row.home_location_id,w.locations[0].id);
    assert.equal(row.current_location_id,w.locations[0].id);
    const out=w.items.find(i=>i.instance.physical_status==='temporarily_out'&&i.instance.home_location_id);
    const returns=[];
    await runBatch(client,w,TEST_USER,[out.instance.id],{field:'return',value:''},()=>{},r=>returns.push(r));
    assert.equal(returns[0].state,'done');
    const eventCount=f.db.movement_events.length;
    await runBatch(client,w,TEST_USER,[out.instance.id],{field:'return',value:''},()=>{},r=>returns.push(r));
    assert.equal(returns[1].state,'skipped');
    assert.equal(f.db.movement_events.length,eventCount);
    assert.equal(f.state().historyHash,history);
    await assert.rejects(runBatch(client,w,TEST_USER,Array.from({length:51},(_,i)=>String(i)),action,()=>{},()=>{}),/1–50/);
    // One failed request must not falsely mark the remaining rows successful.
    f.db.item_styles[4].category_id=null; f.db.item_styles[5].category_id=null;
    let rejectOnce=true;
    const unstable=createClient(f.url,'local-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
      if(init?.method==='PATCH'&&String(input).includes('/item_styles')&&rejectOnce){rejectOnce=false;return new Response(JSON.stringify({message:'模拟一次失败'}),{status:400,headers:{'content-type':'application/json'}});}
      return fetch(input,init);
    }}});
    w=await loadWorkspace(client,f.db.households[0],TEST_USER);
    const partialIds=[f.db.item_instances[4].id,f.db.item_instances[5].id],partial=[];
    await runBatch(unstable,w,TEST_USER,partialIds,action,()=>{},r=>partial.push(r));
    assert.deepEqual(partial.map(r=>r.state),['failed','done']);
    const retried=[];
    await runBatch(client,w,TEST_USER,[partialIds[0]],action,()=>{},r=>retried.push(r),()=>false,partialIds);
    assert.equal(retried[0].state,'done');
    const cancelled=[];
    await runBatch(client,w,TEST_USER,partialIds,action,()=>{},r=>cancelled.push(r),()=>true);
    assert.equal(cancelled.length,0);
    assert.equal(f.state().historyHash,history);
    const target=f.db.item_instances[6], style=f.db.item_styles[6];
    f.db.characters.push({...f.db.categories[0],id:'character-test',ip_id:w.ips[0].id,name:'测试角色'});
    f.db.series.push({...f.db.categories[0],id:'series-test',ip_id:w.ips[0].id,name:'测试系列'});
    w=await loadWorkspace(client,f.db.households[0],TEST_USER);
    const details=[];
    await runBatch(client,w,TEST_USER,[target.id],{field:'character',value:'character-test'},()=>{},r=>details.push(r));
    await runBatch(client,w,TEST_USER,[target.id],{field:'series',value:'series-test'},()=>{},r=>details.push(r));
    assert.deepEqual(details.map(r=>r.state),['done','done']);
    assert.ok(f.db.item_style_characters.some(r=>r.item_style_id===style.id&&r.character_id==='character-test'));
    assert.equal(style.series_id,'series-test');
    assert.equal(f.state().historyHash,history);
    // Location-first movement works for already placed and taken-out items,
    // without changing home positions, siblings, identity, or photographs.
    const moved=f.db.item_instances[0], sibling=f.db.item_instances.find(i=>i.id==='sibling');
    const oldHome=moved.home_location_id, siblingBefore=JSON.stringify(sibling);
    const destination={...f.db.locations[0],id:'second-box',name:'第二个盒子'};
    f.db.locations.push(destination);
    moved.physical_status='temporarily_out';
    w=await loadWorkspace(client,f.db.households[0],TEST_USER);
    const moves=[];
    await runBatch(client,w,TEST_USER,[moved.id],{field:'move',value:destination.id},()=>{},r=>moves.push(r));
    assert.equal(moves[0].state,'done');
    assert.equal(moved.current_location_id,destination.id);
    assert.equal(moved.physical_status,'stored');
    assert.equal(moved.home_location_id,oldHome);
    assert.equal(JSON.stringify(sibling),siblingBefore);
    const afterMove=f.db.movement_events.length;
    await runBatch(client,w,TEST_USER,[moved.id],{field:'move',value:destination.id},()=>{},r=>moves.push(r));
    assert.equal(moves[1].state,'skipped');
    assert.equal(f.db.movement_events.length,afterMove);
    destination.deleted_at=new Date().toISOString();
    await runBatch(client,w,TEST_USER,[second.instance.id],{field:'move',value:destination.id},()=>{},r=>moves.push(r));
    assert.equal(moves[2].state,'failed');
    assert.equal(f.state().historyHash,history);
  } finally { await f.close(); }
});
