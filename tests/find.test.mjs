import test from 'node:test';
import assert from 'node:assert/strict';
import { findItems, emptyFind } from '../lib/collection/find.ts';
const item = (n,status='stored') => ({instance:{id:String(n),inventory_code:`GC-${String(n).padStart(6,'0')}`,created_at:`2026-01-0${n}`,updated_at:`2026-01-0${n}`,physical_status:status},style:{name:'',updated_at:'2026-01-01'},ip:{id:'ip',name:'作品',aliases:['别名']},category:{id:'cat',name:'徽章',aliases:['吧唧']},series:{id:'series',name:'系列',aliases:['第一弹']},characters:[{id:'char',name:'角色',aliases:['小名']}],path:'家'});
test('combined filters and stable sorts preserve original order/objects',()=>{
 const rows=[item(1),item(3,'temporarily_out'),item(2)];
 assert.deepEqual(findItems(rows,{...emptyFind,status:'stored',ip:'ip',category:'cat',character:'char',series:'series'}).map(i=>i.instance.id),['2','1']);
 assert.deepEqual(findItems(rows,{...emptyFind,sort:'oldest'}).map(i=>i.instance.id),['1','2','3']);
 rows[0].style.updated_at='2026-09-01';assert.equal(findItems(rows,{...emptyFind,sort:'updated'})[0],rows[0]);
 assert.deepEqual(rows.map(i=>i.instance.id),['1','3','2']);
 assert.equal(findItems(rows,{...emptyFind,ip:'wrong'}).length,0);
});
